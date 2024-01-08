/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import MemoryView from "./mem-view";
import { Magic } from "./types";
import { type Primitive } from "./util";

export interface Ref<T> {
  // Deref should return the RAW value of the reference
  deref(): T | undefined;
  // Mutable reference will return a proxy, immutable will return its value
  get value(): T | undefined;
}

export class PrimitiveRef implements Ref<Primitive> {
  #value: Primitive;
  constructor(value: Primitive) {
    this.#value = value;
  }
  deref() {
    return this.#value;
  }
  get value() {
    return this.#value;
  }
}

export class SymbolRef extends WeakRef<Symbol> implements Ref<Symbol> {
  constructor(value: Symbol) {
    super(value);
  }
  get value() {
    return this.deref();
  }
  deflate(_: MemoryView): string | undefined {
    const symbol = this.deref();
    if (symbol === undefined) return undefined;
    const { description } = symbol;
    return symbol === Symbol.for(description!)
      ? ("@" as Magic) + description
      : ("$" as Magic) + description;
  }
}

export class MutableRef<T extends Object | Function = any>
  extends WeakRef<T>
  implements Ref<T>
{
  constructor(value: T) {
    super(value);
  }
  get value() {
    const value = this.deref();
    // Should never happen
    if (!value) throw new ReferenceError("MutableRef not available");
    return value;
  }
}
