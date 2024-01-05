import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext from "rpc-magic-proxy";

async function main() {
    const ctx = new RpcContext();
    const workerData = await ctx.serialize({
        hello() {
            console.log(this !== global, this)
        }
    })
    ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
    const ctx = new RpcContext({ preserveThis: true }).bind(parentPort);
    const { hello } = ctx.deserialize(workerData);
    await hello.apply({ foo: "bar" })
    ctx.reset();
}

isMainThread ? main() : worker()
