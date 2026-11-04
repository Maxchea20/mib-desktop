import test from "node:test";
import assert from "node:assert/strict";
import { createAuthManager, AuthFatalError, AuthTransientError } from "./auth.mjs";

const silent = { log() {}, error() {} };

function fakeSession(exp, rt = "rt1") {
  return { access_token: "at", refresh_token: rt, expires_at: exp, user: { id: "u1" } };
}

function setup({ exp = 10_000, refreshImpl, setImpl } = {}) {
  let t = 1000;
  let fatalCalls = 0;
  const calls = { set: 0, refresh: 0, refreshArgs: [] };
  const supabase = {
    auth: {
      setSession: async () => {
        calls.set++;
        return setImpl ? setImpl() : { data: { session: fakeSession(exp) }, error: null };
      },
      refreshSession: async (args) => {
        calls.refresh++;
        calls.refreshArgs.push(args);
        return refreshImpl();
      },
    },
  };
  const mgr = createAuthManager({
    supabase, accessToken: "a", refreshToken: "r",
    onFatal: () => fatalCalls++, now: () => t, log: silent,
  });
  return { mgr, calls, advance: (s) => (t += s), fatal: () => fatalCalls };
}

test("normal login, valid token is reused without refresh", async () => {
  const { mgr, calls } = setup();
  await mgr.ensureFreshSession();
  await mgr.ensureFreshSession();
  assert.equal(calls.set, 1);
  assert.equal(calls.refresh, 0);
});

test("expiry: refresh happens, once, with the explicit refresh token", async () => {
  const { mgr, calls, advance } = setup({
    exp: 1100,
    refreshImpl: async () => ({ data: { session: fakeSession(99999, "rt2") }, error: null }),
  });
  await mgr.ensureFreshSession();
  advance(100);
  // heartbeat + polling at the same moment -> only ONE refresh
  await Promise.all([mgr.ensureFreshSession(), mgr.ensureFreshSession(), mgr.ensureFreshSession()]);
  assert.equal(calls.refresh, 1);
  assert.deepEqual(calls.refreshArgs[0], { refresh_token: "rt1" });
  assert.equal(mgr.getSession().refresh_token, "rt2");
});

test("missing/used refresh token is fatal: onFatal once, never loops", async () => {
  const { mgr, calls, advance, fatal } = setup({
    exp: 1100,
    refreshImpl: async () => ({ data: {}, error: Object.assign(new Error("Auth session missing!"), { status: 400 }) }),
  });
  await mgr.ensureFreshSession();
  advance(100);
  for (let i = 0; i < 20; i++) {
    await assert.rejects(mgr.ensureFreshSession(), AuthFatalError);
  }
  assert.equal(fatal(), 1);
  assert.equal(calls.refresh, 1, "no repeated refresh attempts after fatal");
  assert.equal(mgr.isFatal(), true);
});

test("network failure while token still valid keeps working", async () => {
  const { mgr, advance } = setup({
    exp: 1100,
    refreshImpl: async () => { throw Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError", status: 0 }); },
  });
  await mgr.ensureFreshSession();
  advance(50); // 50s left, inside refresh window but not expired
  const s = await mgr.ensureFreshSession();
  assert.ok(s);
  assert.equal(mgr.isFatal(), false);
});

test("network failure after real expiry: transient error, no jobs, not fatal", async () => {
  const { mgr, advance, fatal } = setup({
    exp: 1100,
    refreshImpl: async () => { throw Object.assign(new Error("fetch failed"), { status: 0 }); },
  });
  await mgr.ensureFreshSession();
  advance(200); // expired
  await assert.rejects(mgr.ensureFreshSession(), AuthTransientError);
  assert.equal(fatal(), 0);
});

test("invalid startup tokens are fatal", async () => {
  const { mgr, fatal } = setup({
    setImpl: () => ({ data: {}, error: Object.assign(new Error("Invalid Refresh Token: Already Used"), { status: 400 }) }),
  });
  await assert.rejects(mgr.ensureFreshSession(), AuthFatalError);
  assert.equal(fatal(), 1);
});
