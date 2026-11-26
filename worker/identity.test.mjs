import test from "node:test";
import assert from "node:assert/strict";
import { workerNameFrom, canRun, profileDirFor, pickWorkerRow } from "./identity.mjs";

test("no name means Woody, so the normal start-up is unchanged", () => {
  assert.equal(workerNameFrom([], {}), "Woody");
  assert.equal(workerNameFrom(["node", "worker.mjs"], {}), "Woody");
});

test("the name comes from --name, --name=, or MIB_WORKER_NAME, tidied", () => {
  assert.equal(workerNameFrom(["--name", "becky"], {}), "Becky");
  assert.equal(workerNameFrom(["--name=Becky"], {}), "Becky");
  assert.equal(workerNameFrom([], { MIB_WORKER_NAME: "Becky" }), "Becky");
  assert.equal(workerNameFrom(["--name", "Becky"], { MIB_WORKER_NAME: "Other" }), "Becky");
  assert.equal(workerNameFrom(["--name", "../../x;rm -rf"], {}), "Xrm -rf".slice(0, 30));
  assert.equal(workerNameFrom(["--name", "   "], {}), "Woody");
});

test("Woody never takes intake jobs; Becky takes only intake jobs", () => {
  assert.equal(canRun("Woody", "facebook_group_post"), true);
  assert.equal(canRun("Woody", "iproperty_create_listing"), true);
  assert.equal(canRun("Woody", "google_business_post"), true);
  assert.equal(canRun("Woody", "generate_property_video"), true);
  assert.equal(canRun("Woody", "listing_intake"), false);
  assert.equal(canRun("Becky", "listing_intake"), true);
  assert.equal(canRun("Becky", "facebook_group_post"), false);
  assert.equal(canRun("Becky", "test_job"), false);
});

test("Woody keeps the old Facebook folder, Becky gets her own", () => {
  assert.equal(profileDirFor("Woody", "/h"), "/h/MIB/facebook-profile");
  assert.equal(profileDirFor("Becky", "/h"), "/h/MIB/facebook-profile-becky");
});

test("Woody takes over the old MIB Desktop row, so his old jobs still belong to him", () => {
  const rows = [{ id: "a", worker_name: "MIB Desktop" }];
  assert.equal(pickWorkerRow(rows, "Woody").id, "a");
  assert.equal(pickWorkerRow(rows, "Becky"), null);
  assert.equal(pickWorkerRow([{ id: "a", worker_name: "MIB Desktop" }, { id: "b", worker_name: "Woody" }], "Woody").id, "b");
  assert.equal(pickWorkerRow([], "Woody"), null);
});
