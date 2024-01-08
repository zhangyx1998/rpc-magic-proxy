import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

async function main() {
  const ctx = new RPCContext();
  const workerData = await ctx.serialize(function tweak(arg) {
    console.log("main:before", { this: this, arg });
    this.foo = "bar";
    delete this.deleteMe;
    arg.hello = "world";
    delete arg.deleteMe;
    console.log("main:after", { this: this, arg });
  });
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext({ carryThis: true, carrySideEffect: true }).bind(
    parentPort,
  );
  console.log("workerData", workerData);
  const tweak = ctx.deserialize(workerData);
  const thisArg = { deleteMe: 123 },
    arg = { deleteMe: 456 };
  console.log("worker:before", { this: thisArg, arg });
  await tweak.apply(thisArg, [arg]);
  console.log("worker:after", { this: thisArg, arg });
  console.assert(thisArg.foo === "bar", "'this' should have foo: 'bar'");
  console.assert(!("deleteMe" in thisArg), "'this' should NOT have deleteMe");
  console.assert(arg.hello === "world", "'arg' should have hello: 'world'");
  console.assert(!("deleteMe" in arg), "'arg' should NOT have deleteMe");
  ctx.reset();
}

isMainThread ? main() : worker();
