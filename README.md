# RPC Magic Proxy

Push any un-serializable object through an Node RPC channel!

## Highlights

1. Translates functions into magic strings which can be proxied back.
2. Proxied function has access to remote thisArg (caller assigned).
3. Proxied function arguments and return values are automatically proxied.
4. Works with circular reference.
5. Retains **strict equality** of objects and arrays inside a "message".
6. Retains types of `Map` and `Set`, also retaining strict equality.

> Planned:
>
> - [ ] Carry side effects on arguments back to caller
> - [ ] Serializing 'pure' functions
> - [ ] Proxy back Map and Set (and Objects) as AsyncMap, AsyncSet etc.
> - [ ] Convert Symbols, retaining strict equality on both sides (half done)
> - [ ] Keep track of object lifecycle across processes

## Usage

```js
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import RPCContext from "rpc-magic-proxy";

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
  };
  // This will serialize data and send it to worker
  const workerData = await ctx.serialize(data);
  ctx.bind(new Worker(new URL(import.meta.url), { workerData }));
}

async function worker() {
  const ctx = new RPCContext().bind(parentPort);
  const { ping, hello } = ctx.deserialize(workerData);
  // Proxy a function call
  console.log("client -> ping():", await ping());
  // Proxy a function call with callback as argument
  await hello((msg) => console.log("client -> hello():", msg));
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

- [hello world](examples/01.hello.js) (shown above)
- [function reflection](examples/02.reflect.js)
- [strict equal](examples/03.strict-equal.js)
- [circular reference](examples/04.circular-ref.js)
- [multi-jump function proxy](examples/05.multi-jump.js)
- [push pull callback proxy](examples/06.push-pull.js)
- [Map and Set reconstruction](examples/07.map-set.js)
- [Preserve Function thisArg](examples/08.this-arg.js)
