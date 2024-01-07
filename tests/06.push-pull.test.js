import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext, { deferPromise } from "rpc-magic-proxy";

async function main() {
  const ctx = new RpcContext();
  const { promise, resolve } = deferPromise();
  // First worker
  ctx.bind(
    new Worker(new URL(import.meta.url), {
      workerData: await ctx.serialize({ push: resolve }),
    }),
  );
  // Second worker
  ctx.bind(
    new Worker(new URL(import.meta.url), {
      workerData: await ctx.serialize({ pull: async () => await promise }),
    }),
  );
}

async function worker() {
  const ctx = new RpcContext().bind(parentPort);
  const { push, pull } = ctx.deserialize(workerData);
  // First worker
  if (push) {
    const { promise, resolve } = deferPromise();
    await push(resolve);
    const value = await promise;
    console.log("Worker 1 got:", value);
  }
  // Second worker
  if (pull) {
    const fn = await pull();
    await fn("Hello from worker 2");
  }
  // This will unbind listeners and allow worker to exit
  ctx.reset();
}

isMainThread ? main() : worker();
