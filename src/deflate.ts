/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import type { MarkupFn } from "./rpc-context";
import type { Magic } from "./types";
import MemoryView from "./mem-view";
import { Primitive, isPrimitive } from "./util";

function map<T>(iterable: Iterable<T>, fn: (x: T) => any, preamble: string) {
  const argv: [string, ...T[]] = [preamble];
  for (const item of iterable) argv.push(fn(item));
  return argv;
}

function deflateSymbol(el: Symbol) {
  return el === Symbol.for(el.description!)
    ? ("@" as Magic) + el.description
    : ("$" as Magic) + el.description;
}

function createBaseElementHandler(mx: MemoryView) {
  return (el: any) => {
    if (typeof el === "string") return ("#" as Magic) + el;
    if (isPrimitive(el)) return el;
    const index = mx.refIndex(el);
    if (index === undefined)
      throw new ReferenceError(`Item ${el} not found in memory view`);
    return ("*" as Magic) + index.toString(16);
  };
}

type DeflatedEl = Primitive | [] | [string, ...any] | Record<string, Primitive>;

export default async function deflate(
  mx: MemoryView,
  fn: (f: MarkupFn) => string,
) {
  const fx = createBaseElementHandler(mx);
  const items: Array<DeflatedEl> = [];
  for (const item of await mx.items()) {
    if (typeof item === "string") items.push(("#" as Magic) + item);
    else if (isPrimitive(item)) items.push(item);
    else if (typeof item === "symbol") items.push(deflateSymbol(item));
    else if (typeof item === "object") {
      if (Array.isArray(item))
        items.push(item.length ? map(item, fx, "A" as Magic) : []);
      else if (item instanceof Map)
        items.push(map(item, ([k, v]) => [fx(k), fx(v)], "M" as Magic));
      else if (item instanceof Set) items.push(map(item, fx, "S" as Magic));
      else
        items.push(
          Object.fromEntries(Object.entries(item).map(([k, v]) => [k, fx(v)])),
        );
    } else if (typeof item === "function") {
      const magic = fn(item);
      const entries = Object.entries(item);
      if (entries.length === 0) items.push(magic);
      else items.push(map(entries, ([k, v]) => [k, fx(v)], magic));
    } else throw new TypeError(`Unknown type ${typeof item}`);
  }
  return items;
}
