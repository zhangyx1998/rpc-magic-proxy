import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  const data = {
    async foo(callback) {
      console.log("foo:", callback === data.bar); // true
      return await callback("foo");
    },
    bar(name) {
      return `bar: ${name} is my friend`;
    },
  };
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext().bind(parentPort);
  const data = ctx.deserialize(workerData);
  const result = await data.foo(data.bar);
  console.assert(
    result === "bar: foo is my friend",
    "result should be bar: foo is my friend, got",
    result,
  );
  ctx.reset();
}

isMainThread ? main() : worker();
