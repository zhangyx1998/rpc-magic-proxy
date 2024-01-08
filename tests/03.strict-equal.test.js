import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  const obj = { hello: "world" };
  const fn = () => {};
  const data = {
    a: obj,
    b: obj,
    c: fn,
    d: fn,
  };
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext().bind(parentPort);
  console.log("workerData", workerData);
  const { a, b, c, d } = ctx.deserialize(workerData);
  console.log({ a, b });
  console.assert(a === b, "a should be strictly equal to b");
  console.log({ c, d });
  console.assert(c === d, "c should be strictly equal to d");
  ctx.reset();
}

isMainThread ? main() : worker();
