import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

const basic = {
  a: 1,
  b: 2,
  c: 3,
  d: [4, 5, 6],
  e: { f: 7, g: 8, h: 9 },
  i: null,
  j: undefined,
  k: true,
  l: false,
  m: "hello",
  n: 123456789n,
};

function stringify(obj) {
  return JSON.stringify(obj, (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  });
}

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
    basic,
    check(_basic) {
      console.log("check basic:", _basic);
      console.assert(
        stringify(basic) === stringify(_basic),
        "basic should be equal",
      );
    },
  };
  // This will serialize data and send it to worker
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext().bind(parentPort);
  console.log("workerData", workerData);
  const { ping, hello, basic: _basic, check } = ctx.deserialize(workerData);
  const result = await ping();
  console.assert(result === "pong", "result should be pong, got", result);
  await hello((world) => {
    console.assert(world === "world", "world should be world, got", world);
  });
  console.log("worker got basic:", _basic);
  console.assert(
    stringify(basic) === stringify(_basic),
    "basic data should be equal",
  );
  await check(_basic);
  ctx.reset();
}

isMainThread ? main() : worker();
