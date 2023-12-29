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

interface DeferredPromise {
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}

function deferPromise(): DeferredPromise & { promise: Promise<any> } {
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

function escape(str: string) {
  return str.replace(/^\#*rpc\:\/\//, (match) => "#" + match);
}

function unescape(str: string) {
  return str.replace(/^\#+rpc\:\/\//, (match) => match.slice(1));
}

function getRpcId(str: string) {
  if (str.startsWith("rpc://~")) {
    return {
      local: str.slice(7),
    };
  } else if (str.startsWith("rpc://")) {
    return {
      remote: str.slice(6),
    };
  } else {
    return {};
  }
}

type Counterpart = Worker | MessagePort;

// This key is used to identify and classify a rpc message
const RPC_TYPE_KEY = "RPC::TYPE";
// This symbol is used to identify if a function is an RPC proxy
const rpcLabel = Symbol("RPC Proxied Function");

type RpcProxy = Function & { [rpcLabel]: { origin: Counterpart; id: string } };

export default class RpcContext {
  private counterparts: Counterpart[] = [];
  constructor(counterpart?: Counterpart) {
    if (counterpart) this.bind(counterpart);
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
        self.handleResponse(payload);
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
  private services: Map<string, Function> = new Map();
  private serviceCounter = 0;
  async serialize<T>(
    _data: Function | T | PromiseLike<T>,
    counterpart?: Counterpart
  ): Promise<string | T> {
    const data = await _data;
    if (typeof data === "string") {
      return escape(data);
    } else if (isRpcPrimitive(data)) {
      return data as T;
    } else if (typeof data === "function") {
      // Check for remote reflection
      if (counterpart && rpcLabel in data) {
        const { origin, id } = (data as any)[rpcLabel]!;
        if (counterpart === origin) {
          // Use reflect
          return "rpc://@" + id;
        }
      }
      // Register RPC handler
      const rpcId = (this.serviceCounter++).toString(16);
      this.services.set(rpcId, data);
      return "rpc://" + rpcId;
    } else if (Array.isArray(data)) {
      return (await Promise.all(
        data.map((el) => this.serialize(el, counterpart))
      )) as T;
    } else if (typeof data === "object") {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(data!).map(
            async ([key, value]: any[]): Promise<any[]> => [
              key,
              await this.serialize(value, counterpart),
            ]
          )
        )
      );
    } else {
      throw new Error(`Unknown data type: ${typeof data}`);
    }
  }

  private async handleRequest(
    {
      request,
      caller,
      args,
    }: {
      request: string;
      caller: string;
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
      const result = await this.services.get(request)!(
        ...(this.deserialize(args, cp) as any[])
      );
      cp.postMessage({
        [RPC_TYPE_KEY]: "response",
        caller,
        value: await this.serialize(result, cp),
      });
    }
  }

  // ========================== RPC Client ==========================
  private pendingReq: Map<string, DeferredPromise> = new Map();
  private reqCounter = 0;

  private createRpcProxy(id: string, cp: Counterpart) {
    const proxy: Function = async (...args: any[]) => {
      const { promise, ...handler } = deferPromise();
      const caller = (this.reqCounter++).toString(16);
      this.pendingReq.set(caller, handler);
      cp?.postMessage({
        [RPC_TYPE_KEY]: "request",
        request: id,
        caller,
        args: await this.serialize(args, cp),
      });
      return promise;
    };
    (proxy as RpcProxy)[rpcLabel] = {
      origin: cp,
      id,
    };
    return proxy;
  }

  deserialize<T>(value: T, counterpart?: Counterpart): T | Function {
    const cp = this.getCounterpart(counterpart);
    if (Array.isArray(value)) {
      return value.map((val) => this.deserialize(val, cp)) as T;
    } else if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => [
          key,
          this.deserialize(val, cp),
        ])
      ) as T;
    } else if (typeof value === "string") {
      if (value.startsWith("rpc://")) {
        const rpcId = value.slice(6);
        if (!rpcId.startsWith("@")) {
          return this.createRpcProxy(rpcId, cp);
        } else {
          const reflect = rpcId.slice(1);
          if (this.services.has(reflect)) return this.services.get(reflect)!;
          else throw new Error(`RPC: local reflection <${reflect}> not exist.`);
        }
      } else {
        // String is a plain value
        return unescape(value) as T;
      }
    } else {
      return value;
    }
  }

  private async handleResponse({
    caller,
    error,
    value,
  }: {
    caller: string;
    error?: any;
    value?: any;
  }) {
    if (!this.pendingReq.has(caller)) return;
    const { resolve, reject } = this.pendingReq.get(caller)!;
    if (!error) {
      resolve(value);
    } else {
      reject(error);
    }
    this.pendingReq.delete(caller);
  }
}
