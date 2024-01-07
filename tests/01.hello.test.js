import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RpcContext();
  const data = {
    ping() {
      console.log("main: got request ping()");
      return "pong";
    },
    async hello(callback) {
      console.log("main: got request hello()");
      await callback("world");
    },
  };
  // This will serialize data and send it to worker
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RpcContext().bind(parentPort);
  const data = ctx.deserialize(workerData);
  const result = await data.ping();
  console.assert(result === "pong", "result should be pong, got", result);
  await data.hello((world) => {
    console.assert(world === "world", "world should be world, got", world);
  });
  ctx.reset();
}

isMainThread ? main() : worker();
