import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext from "rpc-magic-proxy";

/**
 * In this example, functions 'foo()' and 'bar()' are both proxied. The worker
 * will use `bar` as `foo`'s callback parameter.
 * That is, a proxied function will be used as a parameter of another proxied
 * function.
 * ---
 * In earlier implementation of this package, the request and response of this
 * double-proxied function will both jump twice between main thread and worker,
 * but now the magic proxy will detect these "reflections" of a function that
 * actually lives in its own process. And, therefore it can eliminate all these
 * overhead by simply calling the original function.
 */

async function main() {
  const ctx = new RpcContext();
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
  const ctx = new RpcContext().bind(parentPort);
  const data = ctx.deserialize(workerData);
  console.log(await data.foo(data.bar));
  ctx.reset();
}

isMainThread ? main() : worker();
