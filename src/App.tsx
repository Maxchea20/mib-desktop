import { useEffect, useRef, useState } from "react";
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
  const currentJobRef = useRef<Job | null>(null);

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
          throw new Error("Desktop worker authentication failed.");
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
        setLastHeartbeat(new Date().toLocaleTimeString());

        async function finishJob(
          job: Job,
          status: "completed" | "failed",
          errorMessage: string | null = null
        ) {
          const updatePayload: Record<string, unknown> = {
            status,
            completed_at: new Date().toISOString(),
          };

          if (errorMessage) {
            updatePayload.error = errorMessage;
          }

          const { error: updateError } =
            await supabase
              .from("desktop_jobs")
              .update(updatePayload)
              .eq("id", job.id)
              .eq("worker_id", currentWorkerId);

          if (updateError) {
            throw updateError;
          }
        }

        async function executeJob(job: Job) {
          try {
            console.log("MIB Desktop executing background job:", job);

            switch (job.job_type) {
              case "background_test":
              case "test_job":
                // Development-only handlers. These prove the background
                // worker can claim, execute and finish jobs without the UI.
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await finishJob(job, "completed");
                break;

              default:
                // Never leave an unsupported job stuck in processing.
                await finishJob(
                  job,
                  "failed",
                  `No desktop handler registered for job_type: ${job.job_type}`
                );
                break;
            }

            currentJobRef.current = null;
            setCurrentJob(null);
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : "Unknown desktop job error.";

            console.error("MIB Desktop job failed:", message);

            try {
              await finishJob(job, "failed", message);
            } catch (finishError) {
              console.error(
                "MIB Desktop could not record job failure:",
                finishError
              );
            }

            currentJobRef.current = null;
            setCurrentJob(null);
            setError(message);
          }
        }

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
            console.error("Worker heartbeat error:", heartbeatError);
            setStatus("Connection problem");
            setError(heartbeatError.message);
            return;
          }

          setStatus("Online");
          setLastHeartbeat(new Date().toLocaleTimeString());
        }

        async function checkForJob() {
          if (currentJobRef.current !== null) {
            return;
          }

          const { data, error: jobError } =
            await supabase.rpc("claim_next_desktop_job", {
              p_worker_id: currentWorkerId,
            });

          if (jobError) {
            console.error("Job check error:", jobError);
            setError(jobError.message);
            return;
          }

          if (!data || data.length === 0) {
            return;
          }

          const receivedJob = data[0] as Job;

          console.log("MIB Desktop received job:", receivedJob);

          currentJobRef.current = receivedJob;
          setCurrentJob(receivedJob);
          setJobsReceived((count) => count + 1);

          await executeJob(receivedJob);
        }

        heartbeatTimer = setInterval(heartbeat, 30000);
        jobTimer = setInterval(checkForJob, 5000);

        await checkForJob();
      } catch (err) {
        console.error("Desktop worker startup error:", err);

        setStatus("Connection failed");

        setError(
          err instanceof Error ? err.message : "Unknown worker error."
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
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
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
            {status === "Online" && "ðŸŸ¢ "}
            {status === "Connection failed" && "ðŸ”´ "}
            {status === "Connection problem" && "ðŸ”´ "}
            {status !== "Online" &&
              status !== "Connection failed" &&
              status !== "Connection problem" &&
              "ðŸŸ¡ "}
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
                âš™ï¸ {currentJob.job_type}
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
                {JSON.stringify(currentJob.payload, null, 2)}
              </pre>

              <div
                style={{
                  marginTop: "14px",
                  color: "#94a3b8",
                  fontSize: "13px",
                }}
              >
                Worker is processing this job in the background.
              </div>
            </>
          ) : (
            <div
              style={{
                color: "#64748b",
                fontSize: "15px",
              }}
            >
              â³ Waiting for jobs...
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

        <div
          style={{
            marginTop: "20px",
            color: "#64748b",
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          MIB Desktop keeps running from the Windows system tray.
        </div>
      </div>
    </main>
  );
}

export default App;
