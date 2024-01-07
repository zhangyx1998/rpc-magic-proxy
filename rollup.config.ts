import { resolve } from "path";
import { fileURLToPath } from "url";
import { type RollupOptions } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import { dts } from "rollup-plugin-dts";

const ROOT = resolve(fileURLToPath(import.meta.url), "..");
const r = (...p: string[]) => resolve(ROOT, ...p);

const config: RollupOptions[] = [];

// ESM Build
config.push({
  input: r("src", "index.ts"),
  output: {
    format: "esm",
    file: r("dist", "index.mjs"),
    sourcemap: true,
  },
  plugins: [esbuild({ target: "node18" })],
});

// CJS Build
config.push({
  input: r("src", "index.ts"),
  output: {
    format: "cjs",
    file: r("dist", "index.cjs"),
    sourcemap: true,
  },
  plugins: [esbuild({ target: "node18" })],
});

// d.ts Build
config.push({
  input: r("src/index.ts"),
  output: {
    format: "esm",
    file: r("dist", "index.d.ts"),
  },
  plugins: [dts({ respectExternal: true })],
});

export default config;
