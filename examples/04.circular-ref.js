import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  const data = {};
  data.data = data;
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext().bind(parentPort);
  const data = ctx.deserialize(workerData);
  console.log("circular ref:", data === data.data);
  ctx.reset();
}

isMainThread ? main() : worker();
