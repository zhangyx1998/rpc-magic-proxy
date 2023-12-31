import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  const workerData = await ctx.serialize({
    hello() {
      console.assert(this !== global, "this should not be globalThis");
      console.assert(this.foo === "bar", "this should have foo=bar");
    },
  });
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext({ carryThis: true }).bind(parentPort);
  console.log("workerData", workerData);
  const { hello } = ctx.deserialize(workerData);
  await hello.apply({ foo: "bar" });
  ctx.reset();
}

isMainThread ? main() : worker();
