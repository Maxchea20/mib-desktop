// One-off helper: resolves the worker/worker.mjs merge conflict by keeping
// BOTH sides (Google Business import/case + your video generation).
// Usage (from the mib-desktop folder):  node fix-worker-conflict.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const file = "worker/worker.mjs";
const original = fs.readFileSync(file, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
const text = original.replace(/\r\n/g, "\n");

const block =
  /<<<<<<< Updated upstream\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> Stashed changes\n/g;

let count = 0;

const fixed = text.replace(block, (_m, upstream, stashed) => {
  count++;
  // import list: both halves are "name,\n} from ..." -> make two imports
  if (/^\s*handle\w+,\n\} from /.test(upstream)) {
    return `${upstream}\nimport {\n${stashed}`;
  }
  // switch: your case block first, then the Google Business case
  return `${stashed}\n${upstream}`;
});

if (count !== 2) {
  console.error(`Expected 2 conflicts, found ${count}. Nothing changed.`);
  process.exit(1);
}

if (/<<<<<<<|>>>>>>> /.test(fixed)) {
  console.error("Conflict markers remain. Nothing changed.");
  process.exit(1);
}

fs.writeFileSync(`${file}.bak`, original);
fs.writeFileSync(file, fixed.replace(/\n/g, eol));

try {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
} catch (e) {
  fs.writeFileSync(file, original);
  console.error("Result failed syntax check; restored original.\n" + e.stderr);
  process.exit(1);
}

console.log("✅ worker/worker.mjs fixed (backup: worker/worker.mjs.bak).");
