import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RpcContext();
  const data = {};
  data.data = data;
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RpcContext().bind(parentPort);
  console.log("workerData", workerData);
  const data = ctx.deserialize(workerData);
  console.log(data);
  console.assert(data === data.data, "should have circular ref");
  ctx.reset();
}

isMainThread ? main() : worker();
