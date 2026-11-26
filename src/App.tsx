import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./lib/supabase";

// The window shows Woody (posting). Becky (listing intake) runs in the same app and shows on the CRM Worker queue page.
const WORKER_NAME = "Woody";

type WorkerRecord = {
  id: string;
  user_id: string;
  worker_name: string;
  status: string;
  last_seen: string | null;
};

type JobRecord = {
  id: string;
  worker_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

function App() {
  const [worker, setWorker] =
    useState<WorkerRecord | null>(null);

  const [currentJob, setCurrentJob] =
    useState<JobRecord | null>(null);

  const [jobsReceived, setJobsReceived] =
    useState(0);

  const [jobsCompleted, setJobsCompleted] =
    useState(0);

  const [jobsFailed, setJobsFailed] =
    useState(0);

  const [connectionStatus, setConnectionStatus] =
    useState("Connecting...");

  const [error, setError] =
    useState("");

  const [workerProcessStatus, setWorkerProcessStatus] =
    useState("Starting worker...");

  // null = checking, false = must sign in, true = signed in
  const [loggedIn, setLoggedIn] =
    useState<boolean | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      setLoggedIn(Boolean(session && !session.user.is_anonymous));
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          setLoggedIn(false);
          invoke<string>("stop_worker").catch(() => {});
        } else if (session && !session.user.is_anonymous) {
          setLoggedIn(true);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");

    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

    setLoginBusy(false);

    if (signInError) {
      setLoginError(signInError.message);
      return;
    }

    setLoginPassword("");
    setLoggedIn(true);
  }

  /*
  | MIB Desktop signs in as the MIB owner (real account, same as the
  | web app). Anonymous sessions are no longer accepted: the database
  | only allows the real account to read or write CRM data.
  */
  async function getSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session || session.user.is_anonymous) {
      throw new Error("Not signed in.");
    }

    return session;
  }

  // Used by the watchdog below.
  const currentJobRef = useRef<JobRecord | null>(null);
  const lastRestartRef = useRef(0);

  useEffect(() => {
    currentJobRef.current = currentJob;
  }, [currentJob]);

  /*
  | The worker stops itself when its login can no longer be refreshed
  | (it never runs jobs without a valid session). This restarts it with
  | the app's current session: when the worker stops sending heartbeats,
  | and after the app refreshes its own token (only when no job is running).
  */
  async function restartWorker(reason: string) {
    const now = Date.now();

    if (now - lastRestartRef.current < 60000) {
      return;
    }

    lastRestartRef.current = now;

    console.log("Restarting worker:", reason);

    try {
      await invoke<string>("stop_worker");
    } catch (err) {
      console.error("Worker stop error:", err);
    }

    await startNodeWorker();
  }

  async function startNodeWorker() {
    try {
      setWorkerProcessStatus(
        "Authenticating worker..."
      );

      const session =
        await getSession();

      if (
        !session.access_token ||
        !session.refresh_token
      ) {
        throw new Error(
          "Supabase session does not contain the required worker tokens."
        );
      }

      setWorkerProcessStatus(
        "Starting background worker..."
      );

      const result =
        await invoke<string>(
          "start_worker",
          {
            accessToken:
              session.access_token,

            refreshToken:
              session.refresh_token,
          }
        );

      console.log(
        "Worker startup:",
        result
      );

      setWorkerProcessStatus(
        "Background worker running"
      );
    } catch (err) {
      console.error(
        "Worker startup error:",
        err
      );

      setWorkerProcessStatus(
        "Worker startup failed"
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to start background worker."
      );
    }
  }

  async function loadWorker() {
    try {
      const session =
        await getSession();

      const user =
        session.user;

      const {
        data,
        error: workerError,
      } =
        await supabase
          .from("desktop_workers")
          .select(
            "id,user_id,worker_name,status,last_seen"
          )
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "worker_name",
            WORKER_NAME
          )
          .maybeSingle();

      if (workerError) {
        throw workerError;
      }

      if (!data) {
        setWorker(null);
        setConnectionStatus(
          "Worker not registered"
        );
        return null;
      }

      setWorker(
        data as WorkerRecord
      );

      setConnectionStatus(
        "Connected"
      );

      return data as WorkerRecord;
    } catch (err) {
      console.error(
        "Worker load error:",
        err
      );

      setConnectionStatus(
        "Connection failed"
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load worker."
      );

      return null;
    }
  }

  async function loadStatistics(
    workerId: string
  ) {
    try {
      const [
        receivedResult,
        completedResult,
        failedResult,
        currentResult,
      ] = await Promise.all([
        supabase
          .from("desktop_jobs")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "worker_id",
            workerId
          ),

        supabase
          .from("desktop_jobs")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "worker_id",
            workerId
          )
          .eq(
            "status",
            "completed"
          ),

        supabase
          .from("desktop_jobs")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "worker_id",
            workerId
          )
          .eq(
            "status",
            "failed"
          ),

        supabase
          .from("desktop_jobs")
          .select(
            "id,worker_id,job_type,payload,status,error,created_at,started_at,completed_at"
          )
          .eq(
            "worker_id",
            workerId
          )
          .eq(
            "status",
            "processing"
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1),
      ]);

      if (receivedResult.error) {
        throw receivedResult.error;
      }

      if (completedResult.error) {
        throw completedResult.error;
      }

      if (failedResult.error) {
        throw failedResult.error;
      }

      if (currentResult.error) {
        throw currentResult.error;
      }

      setJobsReceived(
        receivedResult.count ?? 0
      );

      setJobsCompleted(
        completedResult.count ?? 0
      );

      setJobsFailed(
        failedResult.count ?? 0
      );

      setCurrentJob(
        currentResult.data &&
          currentResult.data.length > 0
          ? (currentResult.data[0] as JobRecord)
          : null
      );
    } catch (err) {
      console.error(
        "Statistics error:",
        err
      );
    }
  }

  useEffect(() => {
    if (loggedIn !== true) {
      return;
    }

    let timer:
      | ReturnType<typeof setInterval>
      | null = null;

    let stopped = false;

    async function initialize() {
      try {
        await startNodeWorker();

        if (stopped) {
          return;
        }

        const currentWorker =
          await loadWorker();

        if (
          stopped ||
          !currentWorker
        ) {
          return;
        }

        await loadStatistics(
          currentWorker.id
        );
      } catch (err) {
        console.error(
          "Worker initialization error:",
          err
        );
      }
    }

    initialize();

    timer = setInterval(
      async () => {
        if (stopped) {
          return;
        }

        const currentWorker =
          await loadWorker();

        if (
          stopped ||
          !currentWorker
        ) {
          return;
        }

        const lastSeenMs =
          currentWorker.last_seen
            ? new Date(
                currentWorker.last_seen
              ).getTime()
            : 0;

        if (
          Date.now() - lastSeenMs > 90000 &&
          !currentJobRef.current
        ) {
          await restartWorker(
            "no heartbeat for 90 seconds"
          );
        }

        await loadStatistics(
          currentWorker.id
        );
      },
      3000
    );

    const { data: authListener } =
      supabase.auth.onAuthStateChange(
        (event) => {
          if (
            event === "TOKEN_REFRESHED" &&
            !currentJobRef.current
          ) {
            restartWorker(
              "app session refreshed"
            );
          }
        }
      );

    return () => {
      stopped = true;

      authListener.subscription.unsubscribe();

      if (timer) {
        clearInterval(timer);
      }
    };
  }, [loggedIn]);

  if (loggedIn !== true) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#0f172a",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, Helvetica, sans-serif",
          padding: "40px",
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "#1e293b",
            borderRadius: "16px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>
            MIB Desktop
          </h1>

          <p style={{ color: "#94a3b8", margin: 0 }}>
            {loggedIn === null
              ? "Checking login..."
              : "Sign in with your MIB account to start the background worker."}
          </p>

          {loggedIn === false && (
            <>
              <input
                type="email"
                placeholder="Email"
                autoComplete="username"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                style={{ padding: "12px", borderRadius: "8px", border: "1px solid #334155", background: "#0f172a", color: "white" }}
              />

              <input
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                style={{ padding: "12px", borderRadius: "8px", border: "1px solid #334155", background: "#0f172a", color: "white" }}
              />

              {loginError && (
                <p style={{ color: "#f87171", margin: 0 }}>{loginError}</p>
              )}

              <button
                type="submit"
                disabled={loginBusy}
                style={{ padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "white", fontWeight: 600, cursor: "pointer" }}
              >
                {loginBusy ? "Signing in..." : "Sign in"}
              </button>
            </>
          )}
        </form>
      </main>
    );
  }

  const isOnline =
    worker?.status === "online";

  const lastSeenTime =
    worker?.last_seen
      ? new Date(
          worker.last_seen
        ).toLocaleTimeString()
      : "—";

  const statusColor =
    isOnline
      ? "#22c55e"
      : "#ef4444";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          "Arial, Helvetica, sans-serif",
        padding: "40px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "650px",
          background: "#1e293b",
          borderRadius: "16px",
          padding: "32px",
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          MIB Desktop
        </h1>

        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid #475569",
            background: "transparent",
            color: "#cbd5e1",
            cursor: "pointer",
          }}
        >
          Log out
        </button>

        <p
          style={{
            color: "#94a3b8",
            marginBottom: "30px",
          }}
        >
          Background Worker
        </p>

        <div
          style={{
            background: "#0f172a",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              marginBottom: "8px",
            }}
          >
            Worker Status
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "22px",
              fontWeight: 600,
              color: statusColor,
            }}
          >
            <span
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background:
                  statusColor,
                display:
                  "inline-block",
                boxShadow:
                  isOnline
                    ? "0 0 10px rgba(34,197,94,0.6)"
                    : "none",
              }}
            />

            {isOnline
              ? "Online"
              : worker?.status ??
                connectionStatus}
          </div>

          <div
            style={{
              marginTop: "14px",
              fontSize: "13px",
              color: "#94a3b8",
            }}
          >
            Worker process:{" "}
            <span
              style={{
                color:
                  workerProcessStatus.includes(
                    "failed"
                  )
                    ? "#f87171"
                    : "#e2e8f0",
              }}
            >
              {workerProcessStatus}
            </span>
          </div>

          {worker && (
            <>
              <div
                style={{
                  marginTop: "20px",
                  fontSize: "13px",
                  color: "#94a3b8",
                }}
              >
                Worker ID

                <div
                  style={{
                    color: "#e2e8f0",
                    marginTop: "4px",
                    wordBreak:
                      "break-all",
                  }}
                >
                  {worker.id}
                </div>
              </div>

              <div
                style={{
                  marginTop: "14px",
                  fontSize: "13px",
                  color: "#94a3b8",
                }}
              >
                Last heartbeat:{" "}
                <span
                  style={{
                    color:
                      "#e2e8f0",
                  }}
                >
                  {lastSeenTime}
                </span>
              </div>
            </>
          )}

          <div
            style={{
              marginTop: "14px",
              fontSize: "13px",
              color: "#94a3b8",
            }}
          >
            Jobs received:{" "}
            <span
              style={{
                color:
                  "#e2e8f0",
              }}
            >
              {jobsReceived}
            </span>
          </div>

          <div
            style={{
              marginTop: "10px",
              fontSize: "13px",
              color: "#94a3b8",
            }}
          >
            Jobs completed:{" "}
            <span
              style={{
                color:
                  "#22c55e",
              }}
            >
              {jobsCompleted}
            </span>
          </div>

          <div
            style={{
              marginTop: "10px",
              fontSize: "13px",
              color: "#94a3b8",
            }}
          >
            Jobs failed:{" "}
            <span
              style={{
                color:
                  "#f87171",
              }}
            >
              {jobsFailed}
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: "20px",
            background: "#0f172a",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              marginBottom: "12px",
            }}
          >
            Current Job
          </div>

          {currentJob ? (
            <>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "#60a5fa",
                }}
              >
                {currentJob.job_type}
              </div>

              <div
                style={{
                  marginTop: "10px",
                  fontSize: "13px",
                  color: "#94a3b8",
                  wordBreak:
                    "break-all",
                }}
              >
                Job ID:{" "}
                {currentJob.id}
              </div>
            </>
          ) : (
            <div
              style={{
                color: "#64748b",
                fontSize: "15px",
              }}
            >
              Waiting for jobs...
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: "20px",
              padding: "12px",
              background:
                "#450a0a",
              borderRadius: "8px",
              color:
                "#fca5a5",
              fontSize: "14px",
              wordBreak:
                "break-word",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: "18px",
            textAlign: "center",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          MIB Desktop keeps running from the Windows system tray.
        </div>
      </div>
    </main>
  );
}

export default App;