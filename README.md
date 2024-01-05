# RPC Magic Proxy

Push any un-serializable object through an Node RPC channel!

## Highlights

1. Translates functions into magic strings which can be proxied back.
2. Proxied function has access to remote thisArg (caller assigned).
3. Proxied function arguments and return values are automatically proxied.
4. Works with circular reference.
5. Retains strict equality of objects and arrays.
6. Retains types of `Map` and `Set`, also retaining strict equality.

> Planned:
>
> - [ ] Proxy back Map and Set (and Objects) as AsyncMap, AsyncSet etc.
> - [ ] Convert Symbols, retaining strict equality on both sides

## Usage

```js
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RpcContext from "rpc-magic-proxy";

async function main() {
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
}

async function worker() {
  const ctx = new RpcContext().bind(parentPort);
  const data = ctx.deserialize(workerData);
  // Proxy a function call
  console.log("client -> ping():", await data.ping());
  // Proxy a function call with callback as argument
  await data.hello((msg) => console.log("client -> hello():", msg));
  // This will unbind listeners and allow worker to exit
  ctx.reset();
}

isMainThread ? main() : worker();
```

> #### Output:
>
> ```plaintext
> main: got request ping()
> client -> ping(): pong
> main: got request hello()
> client -> hello(): world
> ```

## More examples:

- [hello world](examples/hello.mjs) (shown above)
- [function reflection](examples/reflect.mjs)
- [strict equal](examples/strict-equal.mjs)
- [circular reference](examples/circular-ref.mjs)
- [multi-jump function proxy](examples/multi-jump.mjs)
- [push pull callback proxy](examples/push-pull.mjs)
- [Map and Set reconstruction](examples/map-set.mjs)
- [Preserve Function thisArg](examples/this-arg.mjs)
