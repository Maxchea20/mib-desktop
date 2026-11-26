// Runs before the platform modules load (they read FACEBOOK_PROFILE_DIR when they are first imported).
// With no name, one app runs Woody and Becky, and Woody keeps the Facebook folder he has always used.
// When ONE other worker is started on its own by name, it gets its own Facebook folder unless .env names one.
import { workerNamesFrom, profileDirFor, DEFAULT_WORKER_NAME } from "./identity.mjs";

const names = workerNamesFrom(process.argv.slice(2), process.env);
if (names.length === 1 && names[0] !== DEFAULT_WORKER_NAME && !process.env.FACEBOOK_PROFILE_DIR) {
  process.env.FACEBOOK_PROFILE_DIR = profileDirFor(names[0]);
}
