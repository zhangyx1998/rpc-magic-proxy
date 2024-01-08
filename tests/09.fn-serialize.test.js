import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  function add(x, y) {
    return x + y;
  }
  RPCContext.markSimpleFn(add);
  const workerData = await ctx.serialize(add);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext({ carryThis: true }).bind(parentPort);
  console.log("workerData", workerData);
  const fn = ctx.deserialize(workerData);
  console.assert(fn.name === "add", "fn.name should be add, got", fn.name);
  const result = fn(1, 2);
  console.assert(result === 3, "result should be 3, got", result);
  ctx.reset();
}

isMainThread ? main() : worker();
