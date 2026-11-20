/*
|--------------------------------------------------------------------------
| JOB POLLING SPEED (pure, unit-tested)
|--------------------------------------------------------------------------
|
| Every check for a job is one request to Supabase, and every request is written
| to Supabase's logs (which have a free monthly allowance). Checking every 5
| seconds around the clock is about 17,000 requests a day, almost all of them
| "no job yet".
|
| So the worker checks fast (every 5 s) only while jobs are being worked on, and
| for 2 minutes after the last one (jobs often come in a batch, such as several
| Facebook groups). When it has been quiet longer than that it checks every
| 15 s. A new job therefore waits at most about 15 seconds to start.
|
*/

export const FAST_POLL_MS = 5_000;
export const IDLE_POLL_MS = 15_000;
/** How long after the last job (or start-up) the worker keeps checking fast. */
export const FAST_WINDOW_MS = 2 * 60_000;

/** Milliseconds to wait before the next check for a job. */
export function pollDelayMs(now, lastActivityAt) {
  if (!Number.isFinite(lastActivityAt)) return FAST_POLL_MS;
  const quiet = now - lastActivityAt;
  return quiet < FAST_WINDOW_MS ? FAST_POLL_MS : IDLE_POLL_MS;
}
