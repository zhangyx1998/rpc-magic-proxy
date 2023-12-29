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

function deferPromise() {
  let resolve!: (value?: any) => void, reject!: (error?: any) => void;
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

export default class RpcContext {
  constructor(private counterPart?: Worker | MessagePort) {
    if (counterPart) this.bind(counterPart);
  }
  // ====================== Context Management ======================
  private listeners: Function[] = [];

  bind(counterPart: Worker | MessagePort) {
    this.counterPart = counterPart;
    const self = this;
    const messageHandler = (payload: any) => {
      if (payload?.type === "rpc:request") {
        self.handleRequest(payload);
      } else if (payload?.type === "rpc:response") {
        self.handleResponse(payload);
      }
    };
    const closeHandler = () => self.reset();
    counterPart.on("message", messageHandler);
    counterPart.on("close", closeHandler);
    this.listeners.push(() => {
      counterPart.off("message", messageHandler);
      counterPart.off("close", closeHandler);
    });
  }

  reset() {
    this.services = {};
    this.pendingReq = {};
    while (this.listeners.length) this.listeners.shift()!();
    delete this.counterPart;
  }

  private send(value: any, transferList?: any[]) {
    if (!this.counterPart)
      throw new Error("Bind to a worker or parentPort first.");
    else this.counterPart.postMessage(value, transferList);
  }
  // ========================== RPC Server ==========================
  private services: { [key: string]: Function } = {};
  private serviceCounter = 0;
  async serialize<T>(
    _data: Function | T | PromiseLike<T>
  ): Promise<string | T> {
    const data = await _data;
    if (isRpcPrimitive(data)) {
      return data as T;
    } else if (typeof data === "function") {
      // Register RPC handler
      const rpcId = `rpc://` + (this.serviceCounter++).toString(16);
      this.services[rpcId] = data;
      return rpcId;
    } else if (Array.isArray(data)) {
      return (await Promise.all(data.map((el) => this.serialize(el)))) as T;
    } else if (typeof data === "object") {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(data!).map(
            async ([key, value]: any[]): Promise<any[]> => [
              key,
              await this.serialize(value),
            ]
          )
        )
      );
    } else {
      throw new Error(`Unknown data type: ${typeof data}`);
    }
  }

  private async handleRequest({
    request,
    caller,
    args,
  }: {
    request: string;
    caller: number | string;
    args: any[];
  }) {
    if (!(request in this.services)) {
      this.send({
        type: "rpc:response",
        caller,
        error: `RPC handler not found: ${request}`,
      });
    } else {
      const result = await this.services[request](
        ...(this.deserialize(args) as any[])
      );
      this.send({
        type: "rpc:response",
        caller,
        value: await this.serialize(result),
      });
    }
  }
  // ========================== RPC Client ==========================
  private pendingReq: {
    [key: string]: {
      resolve: (value: any) => void;
      reject: (error?: any) => void;
    };
  } = {};
  private reqCounter = 0;

  private async handleResponse({
    caller,
    error,
    value,
  }: {
    caller: number | string;
    error?: any;
    value?: any;
  }) {
    if (!(caller in this.pendingReq)) return;
    const { resolve, reject } = this.pendingReq[caller];
    error ? reject(error) : resolve(await this.serialize(value));
    delete this.pendingReq[caller];
  }

  deserialize<T>(value: T): T | Function {
    if (typeof value === "object" && value !== null) {
      const self = this;
      return new Proxy(value, {
        get(target: any, prop) {
          return self.deserialize(target[prop]);
        },
      });
    } else if (typeof value === "string" && /^rpc\:\/\//i.test(value)) {
      return async (...args: any[]) => {
        const { promise, ...handler } = deferPromise();
        const caller = (this.reqCounter++).toString(16);
        this.pendingReq[caller] = handler;
        this.send({
          type: "rpc:request",
          request: value, // rpc://xxx
          caller,
          args: await this.serialize(args),
        });
        return promise;
      };
    } else {
      return value;
    }
  }
}
