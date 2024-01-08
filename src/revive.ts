/* ---------------------------------------------------------
 * Copyright (c) 2023 Yuxuan Zhang, web-dev@z-yx.cc
 * This source code is licensed under the MIT license.
 * You may find the full license in project root directory.
 * ------------------------------------------------------ */

import type { Magic } from "./types";
import { Primitive } from "./util";

function ref(el: Primitive, view: any[]) {
  if (typeof el === "string") {
    if (el.startsWith("#" as Magic)) return el.slice(1);
    if (el.startsWith("*" as Magic)) return view[parseInt(el.slice(1), 16)];
  }
  return el;
}

export default {
  // Will be shared with Function, Object and Array
  Generic: (subject: Function | Record<string | symbol, any> = {}) => ({
    subject,
    revive: (data: [string, any][]) => (view: any[]) => {
      const keys = new Set(Object.keys(subject));
      for (const [key, slug] of data) {
        keys.delete(key);
        (subject as any)[key] = ref(slug, view);
      }
      for (const key of keys) delete (subject as any)[key];
    },
  }),

  Symbol: (subject: Symbol) => ({
    subject,
    revive: (data: any[]) => (view: any[]) => {},
  }),

  Array: (subject: Array<any> = []) => ({
    subject,
    revive: (data: any[]) => (view: any[]) => {
      const keys = new Set(Object.keys(subject));
      for (const [i, slug] of data.entries()) {
        keys.delete(i.toString());
        (subject as any[])[i] = ref(slug, view);
      }
      for (const key of keys) delete (subject as any)[key];
    },
  }),

  Map: (subject: Map<any, any> = new Map()) => ({
    subject,
    revive: (data: [any, any][]) => (view: any[]) => {
      subject.clear();
      for (const [a, b] of data) subject.set(ref(a, view), ref(b, view));
    },
  }),

  Set: (subject: Set<any> = new Set()) => ({
    subject,
    revive: (data: any[]) => (view: any[]) => {
      subject.clear();
      for (const slug of data) subject.add(ref(slug, view));
    },
  }),
};
