// Starts the MIB Desktop app as one named worker:
//   npm run tauri:woody   the posting worker (same as the usual "npm run tauri dev")
//   npm run tauri:becky   the listing intake worker
// The name is passed to the app (VITE_MIB_WORKER_NAME) and to the worker it starts (MIB_WORKER_NAME).
import { spawn } from "node:child_process";

const raw = process.argv[2] || "Woody";
const name = raw.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "Woody";

console.log(`Starting MIB Desktop as ${name}...`);

const child = spawn("npm run tauri dev", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, MIB_WORKER_NAME: name, VITE_MIB_WORKER_NAME: name },
});

child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
