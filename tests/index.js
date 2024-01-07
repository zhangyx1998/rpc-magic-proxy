import { readdir } from "fs/promises";
import { spawn } from "child_process";
import c from "chalk";
import { fileURLToPath } from "url";

const TESTS = new URL("./", import.meta.url);

async function dump(pipe) {
  let result = "";
  for await (const chunk of pipe) {
    result += chunk;
  }
  return result;
}

async function runTest(entry) {
  const path = fileURLToPath(new URL(entry, TESTS));
  const test = spawn("node", [path], {
    stdio: ["overlapped", "pipe", "pipe"],
  });
  const timeStart = await new Promise((res) =>
    test.on("spawn", () => res(performance.now())),
  );
  const { stdout, stderr } = test;
  const exit = new Promise((res) =>
    test.on("exit", (code) => res([code, performance.now()])),
  );
  const out = await dump(stdout);
  const err = await dump(stderr);
  const [code, timeEnd] = await exit;
  const pass = !err && code === 0;
  const duration = (timeEnd - timeStart).toFixed(4);
  const report = [
    "",
    c.blue.underline("test program stdout:"),
    "",
    ...out.split("\n").map((l) => c.blue("> ") + c.gray(l)),
    "",
    c.red.underline("test program stderr:"),
    "",
    ...err.split("\n").map((l) => c.red("> ") + c.red(l)),
    "",
    c.underline.yellow("exited with code:", code),
    "",
  ];
  return [entry, pass, duration, report];
}

const entries = (await readdir(TESTS)).filter((e) => e.endsWith(".test.js"));
const maxLen = Math.max(...entries.map((e) => e.length));
for (const entry of entries) {
  const [_, pass, duration, report] = await runTest(entry);
  if (pass)
    console.log(
      c.greenBright("✔"),
      c.underline(entry) + " ".repeat(maxLen - entry.length),
      c.green.dim(`${duration} ms`),
    );
  else {
    console.log(
      c.redBright("✘"),
      c.underline(entry) + " ".repeat(maxLen - entry.length),
      c.red.dim(`${duration} ms`),
    );
    console.log(report.map((l) => "  " + l).join("\n"));
    process.exitCode = 1;
  }
}

if (!process.exitCode)
  console.log("\n" + "🎉", c.greenBright("All tests passed!") + "\n");
else console.error("\n" + "🔥", c.redBright("Some tests failed!") + "\n");

process.exit();
