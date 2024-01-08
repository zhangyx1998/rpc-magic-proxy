import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
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
  const ctx = new RPCContext().bind(parentPort);
  const data = ctx.deserialize(workerData);
  console.log(Object.entries(data));
  // Proxy a function call
  console.log("client -> ping():", await data.ping()); // pong
  // Proxy a function call with callback as argument
  await data.hello((msg) => console.log("client -> hello():", msg)); // world
  // This will unbind listeners and allow worker to exit
  ctx.reset();
}

isMainThread ? main() : worker();
