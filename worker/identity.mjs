/*
|--------------------------------------------------------------------------
| WORKER IDENTITY (pure, unit-tested)
|--------------------------------------------------------------------------
|
| Each worker has a name and only its own kind of jobs:
|
|   Woody   the posting worker (the default): Facebook groups, iProperty, Google Business, videos
|   Becky   the intake worker: reads Facebook links from co-broke agents into draft listings
|
| Start Becky with:   node worker/worker.mjs --name Becky
| Started with no name, the worker is Woody, so the usual start-up keeps working as before.
|
| This is mirrored in the CRM (mib-v1/src/lib/workerRoles.ts). Keep both in step.
|
*/

import os from "node:os";
import path from "node:path";

export const DEFAULT_WORKER_NAME = "Woody";
/** The name the single worker used to register under; it is renamed to Woody. */
export const LEGACY_WORKER_NAME = "MIB Desktop";
export const INTAKE_WORKER = "Becky";
export const INTAKE_JOB_TYPE = "listing_intake";
/** Started with no name (the usual "npm run tauri dev"), one app runs BOTH workers. */
export const DEFAULT_WORKERS = [DEFAULT_WORKER_NAME, INTAKE_WORKER];

/** The name from `--name X`, `--name=X`, or MIB_WORKER_NAME; otherwise Woody. Only letters, digits, space, dash. */
export function workerNameFrom(argv = [], env = {}) {
  let raw = "";
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === "--name" && argv[i + 1]) raw = String(argv[i + 1]);
    else if (a.startsWith("--name=")) raw = a.slice(7);
  }
  if (!raw) raw = String(env.MIB_WORKER_NAME ?? "");
  const clean = raw.replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
  if (!clean) return DEFAULT_WORKER_NAME;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** True when a name was asked for with --name or MIB_WORKER_NAME. */
export function hasExplicitName(argv = [], env = {}) {
  const args = argv.map(String);
  return args.some((a, i) => (a === "--name" && Boolean(args[i + 1])) || (a.startsWith("--name=") && a.length > 7)) || Boolean(String(env.MIB_WORKER_NAME ?? "").trim());
}

/** The workers this process runs: just the one asked for, or Woody and Becky together. */
export function workerNamesFrom(argv = [], env = {}) {
  return hasExplicitName(argv, env) ? [workerNameFrom(argv, env)] : [...DEFAULT_WORKERS];
}

const isIntake = (name) => String(name ?? "").trim().toLowerCase() === INTAKE_WORKER.toLowerCase();

/** Can this worker run this kind of job? Becky only runs intake jobs; every other name runs everything else. */
export function canRun(name, jobType) {
  return isIntake(name) ? jobType === INTAKE_JOB_TYPE : jobType !== INTAKE_JOB_TYPE;
}

/**
 * Each worker keeps its own Facebook login in its own folder. Woody keeps the folder he has always used,
 * so he stays logged in. FACEBOOK_PROFILE_DIR in .env still wins when it is set.
 */
export function profileDirFor(name, home = os.homedir()) {
  if (name === DEFAULT_WORKER_NAME) return path.join(home, "MIB", "facebook-profile");
  return path.join(home, "MIB", `facebook-profile-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
}

/** Which row in desktop_workers this worker should use: its own name, or (for Woody) the old "MIB Desktop" row. */
export function pickWorkerRow(rows, name) {
  const list = Array.isArray(rows) ? rows : [];
  return list.find((r) => r.worker_name === name) ?? (name === DEFAULT_WORKER_NAME ? list.find((r) => r.worker_name === LEGACY_WORKER_NAME) : undefined) ?? null;
}
