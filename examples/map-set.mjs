import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext, { deferPromise } from "rpc-magic-proxy";

async function main() {
    const ctx = new RpcContext();
    ctx.bind(new Worker(new URL(import.meta.url), {
        workerData: await ctx.serialize({
            map: new Map([
                ["key", "value"],
                ["hello", "world"],
                ['foo', function bar() { }]
            ]),
            set: new Set([1, 2, 3, true, false, null, () => { }])
        })
    }));
}

async function worker() {
    const ctx = new RpcContext(parentPort);
    console.log("workerData:", workerData);
    const { map, set } = ctx.deserialize(workerData);
    console.log("Map:", map instanceof Map, Object.fromEntries([...map]));
    console.log("Set:", set instanceof Set, ...set);
    ctx.reset();
}

isMainThread ? main() : worker()
