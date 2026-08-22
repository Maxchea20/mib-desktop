import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./lib/supabase";

const WORKER_NAME = "MIB Desktop";

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

  async function getSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      return session;
    }

    const {
      data,
      error: signInError,
    } =
      await supabase.auth.signInAnonymously();

    if (signInError) {
      throw signInError;
    }

    if (!data.session) {
      throw new Error(
        "Unable to authenticate MIB Desktop."
      );
    }

    return data.session;
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

        await loadStatistics(
          currentWorker.id
        );
      },
      3000
    );

    return () => {
      stopped = true;

      if (timer) {
        clearInterval(timer);
      }
    };
  }, []);

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