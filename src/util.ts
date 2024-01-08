/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import type { DeferredPromise, Awaitable } from "./types";

export function deferPromise<T>(): DeferredPromise<T> & {
  promise: Promise<T>;
} {
  let resolve!: DeferredPromise<T>["resolve"],
    reject!: DeferredPromise<T>["reject"];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    resolve,
    reject,
    promise,
  };
}

export type Primitive = number | string | boolean | bigint | undefined | null;
export function isPrimitive(val: any): val is Primitive {
  return (
    ["number", "string", "boolean", "bigint", "undefined"].includes(
      typeof val,
    ) || val === null
  );
}

export function escape(str: string) {
  return "#" + str;
}

export function unescape(str: string) {
  return str.slice(1);
}

export function define<T extends Object>(
  obj: T,
  prop: string | symbol,
  val: any,
) {
  Object.defineProperty(obj, prop, {
    get: () => val,
    set: () => {},
  });
  return obj;
}

export function clearObject<T extends Map<any, any> | Set<any> | Object>(
  obj: T,
) {
  if (obj instanceof Map || obj instanceof Set) obj.clear();
  else if (typeof obj === "object" && obj !== null)
    Object.keys(obj).forEach((key) => delete (obj as any)[key]);
  else throw new TypeError(`Cannot clear object of type ${typeof obj}`);
  return obj;
}

export function loadObject<T extends Map<any, any> | Set<any> | Object>(
  obj: T,
  items: any[],
) {
  if (obj instanceof Map) for (const [k, v] of items) obj.set(k, v);
  else if (obj instanceof Set) for (const el of items) obj.add(el);
  else if (typeof obj === "object" && obj !== null)
    Object.assign(obj, ...items);
  else throw new TypeError(`Cannot load object of type ${typeof obj}`);
  return obj;
}

async function* $traverse(
  argv: Iterable<Awaitable<WeakKey | Primitive>>,
  visited: Set<WeakKey>,
): AsyncIterableIterator<WeakKey> {
  for (const _val of argv) {
    const val = await _val;
    if (isPrimitive(val)) continue;
    if (visited.has(val)) continue;
    visited.add(val);
    yield val;
    if (val instanceof Map) {
      yield* await $traverse(val.keys(), visited);
      yield* await $traverse(val.values(), visited);
    } else if (val instanceof Set) {
      yield* await $traverse(val.keys(), visited);
    } else {
      yield* await $traverse(Object.values(val), visited);
    }
  }
}

export function traverse(...argv: Awaitable<WeakKey | Primitive>[]) {
  return $traverse(argv, new Set());
}
