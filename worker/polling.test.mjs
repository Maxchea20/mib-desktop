import test from "node:test";
import assert from "node:assert/strict";
import { pollDelayMs, FAST_POLL_MS, IDLE_POLL_MS, FAST_WINDOW_MS } from "./polling.mjs";

test("fast while busy and for 2 minutes after the last job", () => {
  const t0 = 1_000_000;
  assert.equal(pollDelayMs(t0, t0), FAST_POLL_MS);
  assert.equal(pollDelayMs(t0 + FAST_WINDOW_MS - 1, t0), FAST_POLL_MS);
});

test("slow once it has been quiet for the whole window", () => {
  const t0 = 1_000_000;
  assert.equal(pollDelayMs(t0 + FAST_WINDOW_MS, t0), IDLE_POLL_MS);
  assert.equal(pollDelayMs(t0 + 3_600_000, t0), IDLE_POLL_MS);
});

test("a bad or missing time falls back to the safe fast speed", () => {
  assert.equal(pollDelayMs(5, NaN), FAST_POLL_MS);
  assert.equal(pollDelayMs(5, undefined), FAST_POLL_MS);
});

test("the idle speed cuts requests by about two thirds, and a job still starts within 15 seconds", () => {
  assert.equal(IDLE_POLL_MS, 15_000);
  assert.ok(IDLE_POLL_MS / FAST_POLL_MS === 3);
});
