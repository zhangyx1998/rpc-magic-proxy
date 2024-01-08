/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import type { MarkupFn } from "./rpc-context";
import type { Magic } from "./types";
import R from "./revive";
import MemoryView from "./mem-view";

// Callback to inflate a function from deflated string form
// protocol specific
type Fn = (s: string) => MarkupFn;

export function inflateMagic(s: string, fn: Fn, override?: any) {
  // Check for proper handler
  switch (s[0] as Magic) {
    case "<":
    case ">":
    case "=":
      return R.Generic(override ?? fn(s));
    case "@":
      return R.Symbol(override ?? Symbol.for(s.slice(1)));
    case "$":
      return R.Symbol(override ?? Symbol(s.slice(1)));
    case "A":
      return R.Array(override);
    case "O":
      return R.Generic(override);
    case "M":
      return R.Map(override);
    case "S":
      return R.Set(override);
    default:
      throw new TypeError(`[RPC Magic Proxy] inflate: Unknown magic ${s}`);
  }
}

export function isInflatableArray([magic]: any[]) {
  return typeof magic === "string" && !magic.startsWith("#");
}

/**
 * If provided with a memory view, will apply side effects to the view
 */
export default function inflate(argv: any, fn: Fn, mx?: MemoryView) {
  if (!Array.isArray(argv)) return inflate([argv], fn, mx);
  const callbacks: Array<(view: any, fn: Fn) => void> = [];
  // 1st pass to inflate objects (no content filled)
  const view = argv.map((v, i) => {
    const override = mx?.[i]?.deref();
    if (Array.isArray(v)) {
      if (isInflatableArray(v)) {
        const { subject, revive } = inflateMagic(v[0], fn, override);
        if (typeof subject !== "symbol") callbacks.push(revive(v.slice(1)));
        return subject;
      }
      const { subject, revive } = R.Array(override);
      callbacks.push(revive(v));
      return subject;
    }
    if (typeof v === "object" && v !== null) {
      const { subject, revive } = R.Generic(override);
      callbacks.push(revive(Object.entries(v)));
      return subject;
    }
    if (typeof v === "string") {
      if (v.startsWith("#")) return override ?? v.slice(1);
      return inflateMagic(v, fn, override).subject;
    }
    return override ?? v;
  });
  // 2nd pass to revive objects (content filled)
  callbacks.forEach((revive) => revive(view, fn));
  return mx ?? new MemoryView(...view);
}
