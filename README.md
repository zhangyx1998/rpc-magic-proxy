# RPC Magic Proxy

Push any un-serializable object through an Node RPC channel!

## Highlights

## Usage

```js
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext from "rpc-magic-proxy";

if (isMainThread) {
  /*=============================  Main thread  =============================*/
  const ctx = new RpcContext();
  const data = {
    ping() {
      console.log("main: got request ping()");
      return "pong";
    },
    async hello(callback) {
      console.log("main: got request hello()");
      await callback("world");
    },
  };
  // This will serialize data and send it to worker
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
} else {
  /*============================= Worker thread =============================*/
  const ctx = new RpcContext(parentPort);
  const data = ctx.deserialize(workerData);
  // Proxy a function call
  console.log("client -> ping():", await data.ping());
  // Proxy a function call with callback as argument
  await data.hello((msg) => console.log("client -> hello():", msg));
  // This will unbind listeners and allow worker to exit
  ctx.reset();
}
```

> #### Output:
> ```plaintext
> main: got request ping()
> client -> ping(): pong
> main: got request hello()
> client -> hello(): world
> ```