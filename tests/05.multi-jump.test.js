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
  console.log(workerData);
  const { callback, resolve } = ctx.deserialize(workerData);
  console.log({ callback, resolve });
  // First worker
  if (resolve) {
    const { promise, resolve: _resolve } = deferPromise();
    await resolve(_resolve);
    const result = await promise;
    console.assert(
      result === "Hello from worker 2",
      "result should be Hello from worker 2, got",
      result,
    );
  }
  // Second worker
  else if (callback) {
    await callback("Hello from worker 2");
  }
  // Not expected
  else {
    console.assert(false, "should not reach here");
  }
  // This will unbind listeners and allow worker to exit
  ctx.reset();
}

isMainThread ? main() : worker();
