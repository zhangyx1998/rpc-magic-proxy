/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import type MemoryView from "./mem-view";

/**
 * List of all magic (inflatable) keys:
 * - `#` String Literal
 * - `<` Remote Function Call
 * - `>` Local Function Reflection
 * - `=` Simple Function Literal
 * - `*` Reference to another item in memory
 * - `@` Global Symbol Literal (Symbol.for)
 * - `$` Local Symbol Literal (Symbol)
 * - `A` Array Object (Can be omitted)
 * - `O` Basic Object (Should not be used)
 * - `M` Map Object
 * - `S` Set Object
 * - PS. Object literals do not need to be "inflated"
 */
export type Magic =
  | "#"
  | "<"
  | ">"
  | "="
  | "*"
  | "@"
  | "$"
  | "A"
  | "O"
  | "M"
  | "S";

export interface DeferredPromise<T> {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export type PendingRequest<T> = DeferredPromise<T> & {
  argv?: MemoryView;
  this?: MemoryView;
};

export type Awaitable<T> = T | PromiseLike<T>;
