import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

const WORKER_NAME = "MIB Desktop";

type Job = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
};

function App() {
  const [status, setStatus] = useState("Connecting...");
  const [workerId, setWorkerId] = useState("");
  const [lastHeartbeat, setLastHeartbeat] = useState("");
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [jobsReceived, setJobsReceived] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let jobTimer: ReturnType<typeof setInterval> | null = null;

    async function startWorker() {
      try {
        setStatus("Signing in...");
        setError("");

        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          const { data, error: signInError } =
            await supabase.auth.signInAnonymously();

          if (signInError) {
            throw signInError;
          }

          session = data.session;
        }

        if (!session?.user?.id) {
          throw new Error(
            "Desktop worker authentication failed."
          );
        }

        const userId = session.user.id;

        setStatus("Registering desktop...");

        const { data: existingWorker, error: findError } =
          await supabase
            .from("desktop_workers")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();

        if (findError) {
          throw findError;
        }

        let currentWorkerId = existingWorker?.id;

        if (!currentWorkerId) {
          const { data: newWorker, error: insertError } =
            await supabase
              .from("desktop_workers")
              .insert({
                user_id: userId,
                worker_name: WORKER_NAME,
                status: "online",
                last_seen: new Date().toISOString(),
              })
              .select("id")
              .single();

          if (insertError) {
            throw insertError;
          }

          currentWorkerId = newWorker.id;
        } else {
          const { error: updateError } =
            await supabase
              .from("desktop_workers")
              .update({
                status: "online",
                last_seen: new Date().toISOString(),
              })
              .eq("id", currentWorkerId);

          if (updateError) {
            throw updateError;
          }
        }

        setWorkerId(currentWorkerId);
        setStatus("Online");
        setLastHeartbeat(
          new Date().toLocaleTimeString()
        );

        async function heartbeat() {
          const { error: heartbeatError } =
            await supabase
              .from("desktop_workers")
              .update({
                status: "online",
                last_seen: new Date().toISOString(),
              })
              .eq("id", currentWorkerId);

          if (heartbeatError) {
            console.error(
              "Worker heartbeat error:",
              heartbeatError
            );

            setStatus("Connection problem");
            setError(heartbeatError.message);
            return;
          }

          setStatus("Online");
          setLastHeartbeat(
            new Date().toLocaleTimeString()
          );
        }

        async function checkForJob() {
          if (currentJob !== null) {
            return;
          }

          const { data, error: jobError } =
            await supabase.rpc(
              "claim_next_desktop_job",
              {
                p_worker_id: currentWorkerId,
              }
            );

          if (jobError) {
            console.error(
              "Job check error:",
              jobError
            );

            setError(jobError.message);
            return;
          }

          if (!data || data.length === 0) {
            return;
          }

          const receivedJob = data[0] as Job;

          console.log(
            "MIB Desktop received job:",
            receivedJob
          );

          setCurrentJob(receivedJob);
          setJobsReceived((count) => count + 1);
        }

        heartbeatTimer = setInterval(
          heartbeat,
          30000
        );

        jobTimer = setInterval(
          checkForJob,
          5000
        );

        await checkForJob();
      } catch (err) {
        console.error(
          "Desktop worker startup error:",
          err
        );

        setStatus("Connection failed");

        setError(
          err instanceof Error
            ? err.message
            : "Unknown worker error."
        );
      }
    }

    startWorker();

    return () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      if (jobTimer) {
        clearInterval(jobTimer);
      }
    };
  }, []);

  async function completeTestJob() {
    if (!currentJob) {
      return;
    }

    const { error: updateError } =
      await supabase
        .from("desktop_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", currentJob.id)
        .eq("worker_id", workerId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCurrentJob(null);
  }

  async function failTestJob() {
    if (!currentJob) {
      return;
    }

    const { error: updateError } =
      await supabase
        .from("desktop_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: "Test failure from MIB Desktop",
        })
        .eq("id", currentJob.id)
        .eq("worker_id", workerId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCurrentJob(null);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
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
            fontWeight: "700",
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
          Desktop Worker
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
              fontSize: "22px",
              fontWeight: "600",
              color:
                status === "Online"
                  ? "#22c55e"
                  : status === "Connection failed" ||
                    status === "Connection problem"
                  ? "#ef4444"
                  : "#facc15",
            }}
          >
            {status === "Online" && "🟢 "}
            {status === "Connection failed" &&
              "🔴 "}
            {status === "Connection problem" &&
              "🔴 "}
            {status !== "Online" &&
              status !== "Connection failed" &&
              status !== "Connection problem" &&
              "🟡 "}

            {status}
          </div>

          {workerId && (
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
                  wordBreak: "break-all",
                }}
              >
                {workerId}
              </div>
            </div>
          )}

          {lastHeartbeat && (
            <div
              style={{
                marginTop: "14px",
                fontSize: "13px",
                color: "#94a3b8",
              }}
            >
              Last heartbeat:{" "}
              <span style={{ color: "#e2e8f0" }}>
                {lastHeartbeat}
              </span>
            </div>
          )}

          <div
            style={{
              marginTop: "14px",
              fontSize: "13px",
              color: "#94a3b8",
            }}
          >
            Jobs received:{" "}
            <span style={{ color: "#e2e8f0" }}>
              {jobsReceived}
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
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "#60a5fa",
                }}
              >
                ⚙️ {currentJob.job_type}
              </div>

              <div
                style={{
                  marginTop: "10px",
                  fontSize: "13px",
                  color: "#94a3b8",
                  wordBreak: "break-all",
                }}
              >
                Job ID: {currentJob.id}
              </div>

              <pre
                style={{
                  marginTop: "14px",
                  padding: "12px",
                  background: "#1e293b",
                  borderRadius: "8px",
                  color: "#cbd5e1",
                  fontSize: "12px",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(
                  currentJob.payload,
                  null,
                  2
                )}
              </pre>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  marginTop: "14px",
                }}
              >
                <button
                  type="button"
                  onClick={completeTestJob}
                  style={{
                    background: "#16a34a",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  ✓ Complete Test Job
                </button>

                <button
                  type="button"
                  onClick={failTestJob}
                  style={{
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  ✕ Fail Test Job
                </button>
              </div>
            </>
          ) : (
            <div
              style={{
                color: "#64748b",
                fontSize: "15px",
              }}
            >
              ⏳ Waiting for jobs...
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: "20px",
              padding: "12px",
              background: "#450a0a",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "14px",
              wordBreak: "break-word",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

export default App;