import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext, { deferPromise } from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  const { promise, resolve } = deferPromise();
  // First worker
  ctx.bind(
    new Worker(new URL(import.meta.url), {
      workerData: await ctx.serialize({ resolve }),
    }),
  );
  // Second worker
  ctx.bind(
    new Worker(new URL(import.meta.url), {
      workerData: await ctx.serialize({ callback: await promise }),
    }),
  );
}

async function worker() {
  const ctx = new RPCContext().bind(parentPort);
  const { callback, resolve } = ctx.deserialize(workerData);
  // First worker
  if (resolve) {
    const { promise, resolve: _resolve } = deferPromise();
    await resolve(_resolve);
    console.log("Worker 1 got:", await promise);
  }
  // Second worker
  if (callback) {
    await callback("Hello from worker 2");
  }
  // This will unbind listeners and allow worker to exit
  ctx.reset();
}

isMainThread ? main() : worker();
