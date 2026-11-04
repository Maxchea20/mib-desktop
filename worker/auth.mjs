/*
|--------------------------------------------------------------------------
| WORKER AUTH SESSION MANAGER
|--------------------------------------------------------------------------
|
| Keeps the MIB Desktop worker's Supabase session valid, and makes sure a
| broken session can never turn into an endless error loop or into jobs
| running without a valid login.
|
| Rules:
|   - Only ONE refresh runs at a time (heartbeat + job polling used to
|     refresh at the same moment; refresh tokens are single-use, so the
|     second refresh killed the session -> "Auth session missing!").
|   - The refresh token is passed explicitly, so a lost in-memory client
|     session cannot cause "Auth session missing!".
|   - An access token that is still valid is never refreshed early more
|     than needed (window is short), to avoid fighting the MIB Desktop
|     window, which owns the same session.
|   - Network/5xx problems are "transient": retried with backoff, the old
|     token keeps working until it really expires.
|   - Invalid/used/missing refresh token is "fatal": onFatal() is called
|     once and everything must stop. The desktop app restarts the worker
|     with a fresh session.
|
*/

export const REFRESH_WINDOW_SECONDS = 60;

const FATAL_MESSAGE =
  /refresh token|already used|session missing|invalid.*(grant|token|jwt)|jwt expired|not found|revoked/i;

export class AuthTransientError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthTransientError";
  }
}

export class AuthFatalError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthFatalError";
  }
}

export function classifyAuthError(error) {
  const status = error?.status;
  const message = String(error?.message || error || "");

  if (
    error?.name === "AuthRetryableFetchError" ||
    status === 0 ||
    (typeof status === "number" && status >= 500) ||
    /fetch failed|network|timeout|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)
  ) {
    return "transient";
  }

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    FATAL_MESSAGE.test(message)
  ) {
    return "fatal";
  }

  return "transient";
}

export function createAuthManager({
  supabase,
  accessToken,
  refreshToken,
  onFatal = () => {},
  now = () => Math.floor(Date.now() / 1000),
  log = console,
}) {
  let session = null;
  let refreshing = null;
  let fatal = null;

  function secondsLeft() {
    return session ? (session.expires_at || 0) - now() : -1;
  }

  function goFatal(message) {
    if (!fatal) {
      fatal = new AuthFatalError(message);
      log.error(`🔴 Worker authentication failed: ${message}`);
      log.error(
        "The worker has stopped. MIB Desktop will restart it with a fresh login."
      );
      onFatal(fatal);
    }

    return fatal;
  }

  async function establish() {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }

    if (!data?.session) {
      throw new Error("Unable to establish worker session.");
    }

    session = data.session;
    log.log("Worker authenticated as:", session.user.id);
    return session;
  }

  async function refresh() {
    log.log("🔄 Supabase access token is near expiry. Refreshing session...");

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: session.refresh_token,
    });

    if (error) {
      throw error;
    }

    if (!data?.session) {
      throw new Error("Supabase session refresh returned no session.");
    }

    session = data.session;
    log.log("✅ Supabase session refreshed.");
    return session;
  }

  async function ensureFreshSession() {
    if (fatal) {
      throw fatal;
    }

    if (session && secondsLeft() > REFRESH_WINDOW_SECONDS) {
      return session;
    }

    if (!refreshing) {
      refreshing = (async () => {
        try {
          return session ? await refresh() : await establish();
        } catch (error) {
          if (classifyAuthError(error) === "fatal") {
            throw goFatal(error?.message || String(error));
          }

          // Transient: keep using the current token while it is still valid.
          if (session && secondsLeft() > 0) {
            log.error(
              "Supabase refresh failed (network?), will retry:",
              error?.message || error
            );
            return session;
          }

          throw new AuthTransientError(error?.message || String(error));
        } finally {
          refreshing = null;
        }
      })();
    }

    return refreshing;
  }

  return {
    ensureFreshSession,
    getSession: () => session,
    isFatal: () => Boolean(fatal),
  };
}
