import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  const obj = { hello: "world" };
  const data = {
    a: obj,
    b: obj,
  };
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext().bind(parentPort);
  const { a, b } = ctx.deserialize(workerData);
  console.log("strict equal:", a === b);
  ctx.reset();
}

isMainThread ? main() : worker();
