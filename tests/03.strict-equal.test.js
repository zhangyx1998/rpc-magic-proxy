import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RpcContext();
  const obj = { hello: "world" };
  const data = {
    a: obj,
    b: obj,
  };
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RpcContext().bind(parentPort);
  console.log("workerData", workerData);
  const { a, b } = ctx.deserialize(workerData);
  console.log({ a, b });
  console.assert(a === b, "a should be strictly equal to b");
  ctx.reset();
}

isMainThread ? main() : worker();
