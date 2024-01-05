/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import { type Worker, type MessagePort } from "worker_threads";

function isRpcPrimitive(value: any) {
  return (
    ["number", "string", "boolean", "undefined"].includes(typeof value) ||
    value === null
  );
}

function define(obj: any, prop: string | symbol, val: any) {
  Object.defineProperty(obj, prop, {
    get: () => val,
    set: () => {},
  });
}

interface DeferredPromise {
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}

export function deferPromise(): DeferredPromise & { promise: Promise<any> } {
  let resolve!: DeferredPromise["resolve"], reject!: DeferredPromise["reject"];
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    resolve,
    reject,
    promise,
  };
}

/**
 * RPC Protocol Preamble Characters:
 * ---
 * 0. #: Escape character for normal string
 * 1. $: RPC remote function
 * 2. @: RPC local reflection
 * 3. &: Object reference
 * ---
 * Magic Proxy Protocol:
 * For example:
 * $1:foo   [FunctionProxy, { name: "foo" }]
 * @123/Map new Map(context[123])
 * ---
 * INTERNAL USE ONLY, SUBJECT TO CHANGE
 */

function escape(str: string) {
  return "#" + str;
}

function unescape(str: string) {
  return str.slice(1);
}

type Counterpart = Worker | MessagePort;

// This key is used to identify and classify a rpc message
const RPC_TYPE_KEY = "RPC::TYPE";
// This symbol is used to identify if a function is an RPC proxy
const rpcLabel = Symbol("RPC Proxied Function");

type RpcProxy = Function & { [rpcLabel]: { origin: Counterpart; id: string } };

interface RpcContextOptions {
  /**
   * If set to true, the `this` context of the remote function will be preserved
   * @default false
   */
  preserveThis?: boolean;

  /**
   * By default, `globalThis` will be replaced with `undefined` to prevent
   * unintentional access to remote global variables. Turn this on if you really
   * need to access the globalThis on the remote side.
   * Notice: this might incur heavy performance penalty.
   * @default false
   */
  preserveGlobalThis?: boolean;
}

export default class RpcContext {
  private counterparts: Counterpart[] = [];
  private options: RpcContextOptions = {
    preserveThis: false,
    preserveGlobalThis: false,
  };
  constructor(options?: RpcContextOptions) {
    Object.assign(this.options, options);
  }
  // ====================== Context Management ======================
  private listeners: Function[] = [];

  bind(counterpart: Counterpart) {
    this.counterparts.push(counterpart);
    const self = this;
    const messageHandler = (payload: any) => {
      const type = payload?.[RPC_TYPE_KEY];
      if (type === "request") {
        self.handleRequest(payload, counterpart);
      } else if (type === "response") {
        self.handleResponse(payload, counterpart);
      }
    };
    const closeHandler = () => self.reset();
    counterpart.on("message", messageHandler);
    counterpart.on("close", closeHandler);
    this.listeners.push(() => {
      counterpart.off("message", messageHandler);
      counterpart.off("close", closeHandler);
    });
    return this;
  }

  reset() {
    this.services.clear();
    this.pendingReq.clear();
    this.counterparts.length = 0;
    while (this.listeners.length) this.listeners.shift()?.();
  }

  private getCounterpart(cp?: Counterpart) {
    if (cp) return cp;
    if (this.counterparts.length !== 1)
      throw new Error(
        [
          "Counterpart can only be omitted for a dedicated context",
          `currently got ${this.counterparts.length} counterparts`,
        ].join(", ")
      );
    return this.counterparts[0]!;
  }

  // ========================== RPC Server ==========================
  private srvIdMap = new WeakMap<Function, string>();
  private services: Map<string, Function> = new Map();
  private serviceCounter = 0;

  async #serialize<T>(
    _data: Function | T,
    context: Array<any>,
    counterpart?: Counterpart,
    refs: WeakMap<any, string> = new WeakMap()
  ) {
    const data = await _data;
    function $(id: any) {
      refs.set(data, id);
      return id;
    }
    if (refs.has(data)) return refs.get(data);
    if (typeof data === "string") return escape(data);
    if (isRpcPrimitive(data)) return data;
    if (typeof data === "function") {
      // Check for remote reflection
      if (counterpart && rpcLabel in data) {
        const { origin, id } = (data as any)[rpcLabel]!;
        if (counterpart === origin) {
          // Use reflect
          return $("@" + id);
        }
      }
      const name = data.name ? `:${data.name}` : "";
      if (this.srvIdMap.has(data)) {
        // Check if function is already registered
        return $("$" + this.srvIdMap.get(data)! + name);
      } else {
        // Register RPC handler
        const rpcId = (this.serviceCounter++).toString(16);
        this.srvIdMap.set(data, rpcId);
        this.services.set(rpcId, data);
        return $("$" + rpcId + name);
      }
    }
    if (Array.isArray(data) || data instanceof Set || data instanceof Map) {
      const refId = context.length.toString(16);
      const id = $(
        `&${refId}` +
          // Add slash constructor
          (data instanceof Set ? "/Set" : "") ||
          (data instanceof Map ? "/Map" : "") ||
          ""
      );
      const serialized: any[] = [];
      context.push(serialized);
      for (const el of data) {
        serialized.push(await this.#serialize(el, context, counterpart, refs));
      }
      return id;
    }
    if (typeof data === "object") {
      const refId = $("&" + context.length.toString(16));
      const serialized: any = {};
      context.push(serialized);
      for (const [key, value] of Object.entries(data as any)) {
        serialized[key] = await this.#serialize(
          value,
          context,
          counterpart,
          refs
        );
      }
      return refId;
    }
    throw new Error(`Unsupported data type: ${typeof data}`);
  }

  async serialize<T>(
    data: Function | T | PromiseLike<T>,
    counterpart?: Counterpart
  ) {
    const context: Array<any> = [];
    const val = await this.#serialize(data, context, counterpart);
    return context.length ? context : val;
  }

  private async handleRequest(
    {
      request,
      caller,
      this: thisArg,
      args,
    }: {
      request: string;
      caller: string;
      this?: any;
      args: any[];
    },
    cp: Counterpart
  ) {
    if (!this.services.has(request)) {
      cp.postMessage({
        [RPC_TYPE_KEY]: "response",
        caller,
        error: `RPC handler not found: ${request}`,
      });
    } else {
      try {
        const service = this.services.get(request)!;
        const _this = await this.deserialize(thisArg, cp);
        const argv = await this.deserialize(args, cp);
        const result = await service.apply(_this, argv);
        cp.postMessage({
          [RPC_TYPE_KEY]: "response",
          caller,
          value: await this.serialize(result, cp),
        });
      } catch (error) {
        cp.postMessage({
          [RPC_TYPE_KEY]: "response",
          caller,
          error: await this.serialize(error, cp),
        });
      }
    }
  }

  // ========================== RPC Client ==========================
  private pendingReq: Map<string, DeferredPromise> = new Map();
  private reqCounter = 0;

  private normalizeProxyThisArg(thisArg: any) {
    if (thisArg === this) return undefined;
    if (!this.options.preserveThis) return undefined;
    if (!this.options.preserveGlobalThis && thisArg === global)
      return undefined;
    return thisArg;
  }

  private async initiateRequest(
    id: string,
    cp: Counterpart,
    thisArg: any,
    args: any[]
  ) {
    const { promise, ...handler } = deferPromise();
    const caller = (this.reqCounter++).toString(16);
    this.pendingReq.set(caller, handler);
    const _this = this.normalizeProxyThisArg(thisArg);
    cp?.postMessage({
      [RPC_TYPE_KEY]: "request",
      request: id,
      caller,
      this: await this.serialize(_this, cp),
      args: await this.serialize(args, cp),
    });
    return promise;
  }

  private createRpcProxy(
    id: string,
    cp: Counterpart,
    name: string = "RPC Anonymous Proxy"
  ) {
    const initiateRequest = this.initiateRequest.bind(this);
    async function proxy(this: any, ...args: any[]) {
      return initiateRequest(id, cp, this, args);
    }
    define(proxy, "name", name);
    define(proxy, rpcLabel, { origin: cp, id });
    return proxy;
  }

  #deserialize<T>(
    value: T,
    context: Array<any> & Record<string, any>,
    callbacks: Array<(ctx: typeof context) => void>,
    counterpart?: Counterpart
  ): T | any {
    const cp = this.getCounterpart(counterpart);
    if (typeof value === "object" && value !== null) {
      for (const key in value) {
        value[key] = this.#deserialize(value[key], context, callbacks, cp);
      }
      return value;
    } else if (typeof value === "string") {
      if (value.startsWith("$")) {
        const [rpcId, name] = value.slice(1).split(":");
        return this.createRpcProxy(rpcId, cp, name);
      } else if (value.startsWith("@")) {
        const reflectId = value.slice(1);
        if (this.services.has(reflectId)) return this.services.get(reflectId)!;
        else throw new Error(`RPC: local reflection @${reflectId} not exist.`);
      } else if (value.startsWith("&")) {
        const refFull = (value as string).slice(1);
        const [refHex, refType] = refFull.split("/");
        if (refType && refFull in context) return context[refFull];
        const refId = parseInt(refHex, 16);
        if (!(refId in context))
          throw new Error(`RPC: object reference &${refId} not exist.`);
        switch (refType) {
          case "Map":
            callbacks.push((ctx) =>
              (ctx[refId] as Array<[any, any]>).forEach(([k, v]) =>
                (context[refFull] as Map<any, any>).set(k, v)
              )
            );
            return (context[refFull] = new Map());
          case "Set":
            callbacks.push((ctx) =>
              (ctx[refId] as Array<any>).forEach((e) =>
                (context[refFull] as Set<any>).add(e)
              )
            );
            return (context[refFull] = new Set());
          default:
            return context[refId];
        }
      } else {
        // String is a plain value
        return unescape(value);
      }
    } else {
      return value;
    }
  }

  deserialize<T>(value: T, counterpart?: Counterpart) {
    if (Array.isArray(value)) {
      const context = value as any[];
      const callbacks: Array<(ctx: typeof context) => void> = [];
      const result = context.map((val) =>
        this.#deserialize(val, context, callbacks, counterpart)
      );
      callbacks.forEach((cb) => cb(result));
      return result[0];
    } else {
      return this.#deserialize(value, [], [], counterpart);
    }
  }

  private async handleResponse(
    {
      caller,
      error,
      value,
    }: {
      caller: string;
      error?: any;
      value?: any;
    },
    counterpart: Counterpart
  ) {
    if (!this.pendingReq.has(caller)) return;
    const { resolve, reject } = this.pendingReq.get(caller)!;
    if (!error) {
      resolve(this.deserialize(value, counterpart));
    } else {
      reject(error);
    }
    this.pendingReq.delete(caller);
  }
}
