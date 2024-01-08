import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

function test(N = 1000, name = "test") {
  return async (cb, ...args) => {
    const results = [];
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      results.push(await cb(...args));
    }
    const duration = N / (performance.now() - start);
    console.log(name, "took", duration.toFixed(4), "KQps", "*", results.length);
  };
}

const configs = {
  TT: { carryThis: true, carrySideEffect: true },
  TF: { carryThis: true, carrySideEffect: false },
  FT: { carryThis: false, carrySideEffect: true },
  FF: { carryThis: false, carrySideEffect: false },
};

async function main() {
  function workload(arg) {
    if (this) this.foo = "bar".repeat(1000);
    arg.foo = "bar".repeat(1000);
    return "world".repeat(1000);
  }
  for (const [name, config] of Object.entries(configs)) {
    console.log("=".repeat(10), name, "=".repeat(10));
    const ctx = new RPCContext(config);
    const workerData = await ctx.serialize({ workload });
    const worker = new Worker(new URL(import.meta.url), { workerData });
    ctx.bind(worker);
    await new Promise((resolve) => worker.on("exit", resolve));
  }
}

async function worker() {
  for (const [name, config] of Object.entries(configs)) {
    const ctx = new RPCContext(config).bind(parentPort);
    const { workload } = ctx.deserialize(workerData);
    await test(10000, name)(workload, {});
    ctx.reset();
  }
}

isMainThread ? main() : worker();
