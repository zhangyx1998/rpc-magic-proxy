/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import type { Magic, PendingRequest } from "./types";
import MemoryView, { symMemView } from "./mem-view";
import inflate from "./inflate";
import deflate from "./deflate";
import { deferPromise, define, isPrimitive } from "./util";
interface Counterpart {
  postMessage: MessagePort["postMessage"];
  on: (event: "message" | "close", handler: Function) => void;
  off: (event: "message" | "close", handler: Function) => void;
}

export type MarkupFn = Function & {
  [symSimpleFn]?: true;
  [symProxyFn]?: { origin: Counterpart; id: string };
};

// This key is used to identify and classify a rpc message
const RPC_TYPE_KEY = "RPC::TYPE";

// This symbol is used to identify if a function is an RPC proxy
const symProxyFn = Symbol("RPC Magic Proxy");

// This symbol is used to mark a function as a simple RPC function
const symSimpleFn = Symbol("RPC Simple Function");

interface RPCContextOptions {
  /**
   * If set to true, the `this` context of the remote function will be carried
   * @default true
   */
  carryThis?: boolean;

  /**
   * By default, `globalThis` will be replaced with `undefined` to prevent
   * unintentional access to remote global variables. Turn this on if you really
   * need to access the globalThis on the remote side.
   * Notice: this might incur significant performance penalty.
   * @default false
   */
  carryGlobalThis?: boolean;

  /**
   * Think of this following example:
   * ```
   * fn(obj) { obj.a = 1; delete obj.b; }
   * ```
   * This function does not have any return value, but it does have side effects
   * on its argument. If `carrySideEffect` is enabled, the changes to arguments
   * will be carried back to the caller. Otherwise, the caller will NOT be able
   * to observe the changes (side effects) imposed by remote function.
   * Note:
   * 1. When used with `carryThis: true`, side effects on thisArg will also be
   *    carried back.
   * 2. Side effects will NOT be visible to caller until the function returns.
   * @default true
   */
  carrySideEffect?: boolean;
}

export default class RPCContext {
  private counterparts: Counterpart[] = [];
  private options: RPCContextOptions = {
    carryThis: true,
    carryGlobalThis: false,
    carrySideEffect: true,
  };
  constructor(options?: RPCContextOptions) {
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
    this.requests.clear();
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
        ].join(", "),
      );
    return this.counterparts[0]!;
  }

  // ========================== RPC Server ==========================
  private srvIdMap = new WeakMap<Function, string>();
  private services: Map<string, Function> = new Map();
  private serviceCounter = 0;

  private deflateFn(fn: MarkupFn, counterpart?: Counterpart) {
    if (fn[symSimpleFn]) return ("=" as Magic) + fn.toString();
    if (fn[symProxyFn]) {
      const { id, origin } = fn[symProxyFn]!;
      if (origin === counterpart) return (">" as Magic) + id;
    }
    if (!this.srvIdMap.has(fn)) {
      const id = (this.serviceCounter++).toString(16);
      this.srvIdMap.set(fn, id);
      this.services.set(id, fn);
    }
    const suffix = fn.name ? `:${fn.name}` : "";
    return ("<" as Magic) + this.srvIdMap.get(fn)! + suffix;
  }

  async serialize(data: any, counterpart?: Counterpart) {
    const mx = new MemoryView(data);
    const deflated = await deflate(mx, (fn) => this.deflateFn(fn, counterpart));
    return define(deflated, symMemView, mx) as typeof deflated & {
      [symMemView]: MemoryView;
    };
  }

  private async handleRequest(
    {
      request,
      caller,
      this: thisArg,
      argv,
    }: {
      request: string;
      caller: string;
      this?: any;
      argv: any[];
    },
    cp: Counterpart,
  ) {
    if (!this.services.has(request)) {
      cp.postMessage({
        [RPC_TYPE_KEY]: "response",
        caller,
        error: `RPC handler not found: ${request}`,
      });
    } else {
      const $ = this.options.carrySideEffect
        ? (value: ReturnType<RPCContext["deserialize"]>) =>
            isPrimitive(value) ? undefined : value[symMemView]
        : () => {};
      try {
        const _this = this.deserialize(thisArg, cp);
        const $this = $(_this);
        const _argv = this.deserialize(argv, cp);
        const $argv = $(_argv);
        const fn = (f: MarkupFn) => this.deflateFn(f, cp);
        try {
          const callee = this.services.get(request)!;
          const result = await callee.apply(_this, _argv);
          cp.postMessage({
            [RPC_TYPE_KEY]: "response",
            caller,
            value: await this.serialize(result, cp).catch(console.error),
            argv: $argv && (await deflate($argv, fn).catch(console.error)),
            this: $this && (await deflate($this, fn).catch(console.error)),
          });
        } catch (error) {
          cp.postMessage({
            [RPC_TYPE_KEY]: "response",
            caller,
            error: await this.serialize(error, cp).catch(console.error),
            argv: $argv && (await deflate($argv, fn).catch(console.error)),
            this: $this && (await deflate($this, fn).catch(console.error)),
          });
        }
      } catch (error) {
        console.error("[RPC Magic Proxy]", error);
      }
    }
  }

  // ========================== RPC Client ==========================
  private requests: Map<string, PendingRequest<any>> = new Map();
  private reqCounter = 0;

  private normalizeProxyThisArg(thisArg: any) {
    if (thisArg === this) return undefined;
    if (!this.options.carryThis) return undefined;
    // @ts-ignore
    if (!this.options.carryGlobalThis && thisArg === global) return undefined;
    return thisArg;
  }

  private async initiateRequest(
    id: string,
    cp: Counterpart,
    thisArg: any,
    argv: any[],
  ) {
    const { promise, ...handler } = deferPromise();
    const pendingReq = handler as PendingRequest<any>;
    thisArg = this.normalizeProxyThisArg(thisArg);
    const _this = await this.serialize(thisArg).catch(console.error);
    const _argv = await this.serialize(argv, cp).catch(console.error);
    if (this.options.carrySideEffect) {
      pendingReq.argv = _argv?.[symMemView];
      pendingReq.this = _this?.[symMemView];
    }
    const caller = (this.reqCounter++).toString(16);
    this.requests.set(caller, pendingReq);
    cp?.postMessage({
      [RPC_TYPE_KEY]: "request",
      request: id,
      caller,
      this: _this,
      argv: _argv,
    });
    return promise;
  }

  private createProxyFn(_id: string, cp: Counterpart) {
    const [id, name = "RPC Magic Proxy"] = _id.split(":");
    const initiateRequest = this.initiateRequest.bind(this);
    async function proxy(this: any, ...argv: any[]) {
      return initiateRequest(id, cp, this, argv);
    }
    define(proxy, "name", name);
    define(proxy, symProxyFn, { origin: cp, id });
    return proxy as MarkupFn;
  }

  /**
   * Add a marker to provided function to indicate that it is a simple function
   * Simple functions will not be proxied, but will be serialized into strings
   * and deserialized as a local function on the other side.
   */
  static markSimpleFn<T extends Function>(fn: T) {
    define(fn, symSimpleFn, true);
    return fn as T & MarkupFn;
  }

  private inflateFn(magic: string, cp: Counterpart) {
    const key = magic[0] as Magic;
    const id = magic.slice(1);
    switch (key) {
      case "<":
        return this.createProxyFn(id, cp);
      case ">":
        if (!this.services.has(id))
          throw new ReferenceError(`RPC local reflection not found: ${id}`);
        return this.services.get(id)!;
      case "=":
        return define(new Function(`return (${id})`)(), symSimpleFn, true);
      default:
        throw new TypeError(`Unknown fn magic "${magic}"`);
    }
  }

  deserialize<T>(value: T, counterpart?: Counterpart) {
    const cp = this.getCounterpart(counterpart);
    const mx = inflate(value, (s) => this.inflateFn(s, cp));
    if (isPrimitive(mx.value)) return mx.value;
    return define(mx.value, symMemView, mx) as Object & {
      [symMemView]: MemoryView;
    };
  }

  private async handleResponse(
    {
      caller,
      error,
      value,
      argv: argvRx,
      this: thisRx,
    }: {
      caller: string;
      error?: any;
      value?: any;
      argv?: MemoryView;
      this?: MemoryView;
    },
    counterpart: Counterpart,
  ) {
    if (!this.requests.has(caller)) return;
    const {
      resolve,
      reject,
      argv: argvTx,
      this: thisTx,
    } = this.requests.get(caller)!;
    // Carry back argv side effect if argv is present
    if (argvTx && argvRx)
      inflate(argvRx, (s) => this.inflateFn(s, counterpart), argvTx);
    // Carry back this side effect if this is present
    if (thisTx && thisRx)
      inflate(thisRx, (s) => this.inflateFn(s, counterpart), thisTx);
    // Resolve or reject the pending promise
    if (!error) {
      resolve(this.deserialize(value, counterpart));
    } else {
      reject(error);
    }
    this.requests.delete(caller);
  }
}
