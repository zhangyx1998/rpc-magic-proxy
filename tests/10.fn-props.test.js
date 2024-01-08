import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  function add(x, y) {
    return x + y;
  }
  RPCContext.markSimpleFn(add);
  add.hello = "world";
  function sub(x, y) {
    return x - y;
  }
  sub.data = { foo: "bar" };
  const workerData = await ctx.serialize({ add, sub });
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext({ carryThis: true }).bind(parentPort);
  console.log("workerData", workerData);
  const { add, sub } = ctx.deserialize(workerData);
  console.assert(add.name === "add", "add.name should be add, got", add.name);
  console.assert(add(1, 2) === 3, "result should be 3, got", add(1, 2));
  console.assert(sub.name === "sub", "sub.name should be sub, got", sub.name);
  const result = await sub(1, 2);
  console.assert(result === -1, "result should be -1, got", result);
  ctx.reset();
}

isMainThread ? main() : worker();
