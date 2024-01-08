/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import { isPrimitive, traverse, type Primitive } from "./util";
import { PrimitiveRef, SymbolRef, MutableRef } from "./refs";

export const symMemView = Symbol("Memory View");

type Ref = PrimitiveRef | SymbolRef | MutableRef;

export default class MemoryView extends Array<Ref> {
  private refs = new WeakMap<WeakKey, number>();
  private root?: Primitive | WeakKey;
  constructor(...values: (Primitive | WeakKey)[]) {
    super();
    // Values are trusted to be unique, callers should know what they are doing
    // No promise objects should exist in the initial values
    this.push(
      ...values.map((val, index) => {
        if (isPrimitive(val)) return new PrimitiveRef(val);
        else {
          this.refs.set(val, index);
          return typeof val === "symbol"
            ? new SymbolRef(val)
            : new MutableRef(val);
        }
      }),
    );
    // Preserve strong reference to the first value
    this.root = values[0];
  }

  private register(value: WeakKey) {
    if (!this.refs.has(value)) {
      this.refs.set(value, this.length);
      if (isPrimitive(value)) this.push(new PrimitiveRef(value));
      else if (typeof value === "symbol") this.push(new SymbolRef(value));
      else this.push(new MutableRef(value));
    }
    return this.refs.get(value)!;
  }

  refIndex(value: WeakKey) {
    return this.refs.get(value);
  }

  get value() {
    return this.root;
  }

  private *iter() {
    // Then yield all values
    for (const ref of this) {
      yield ref.deref();
    }
  }

  async items() {
    // First check if all objects are tracked in the view
    for await (const value of traverse(this.root)) this.register(value);
    // Then yield all values
    return this.iter();
  }
}
