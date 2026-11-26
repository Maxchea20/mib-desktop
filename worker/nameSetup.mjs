// Runs before the platform modules load (they read FACEBOOK_PROFILE_DIR when they are first imported).
// Decides this worker's name and gives it its own Facebook folder unless .env already names one.
import { workerNameFrom, profileDirFor } from "./identity.mjs";

const name = workerNameFrom(process.argv.slice(2), process.env);
process.env.MIB_WORKER_NAME = name;
if (!process.env.FACEBOOK_PROFILE_DIR) process.env.FACEBOOK_PROFILE_DIR = profileDirFor(name);
