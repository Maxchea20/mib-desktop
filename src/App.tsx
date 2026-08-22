import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";

const WORKER_NAME = "MIB Desktop";

type Job = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
};

type JobResult = {
  success: boolean;
  error?: string;
};

function App() {
  const [status, setStatus] = useState("Connecting...");
  const [workerId, setWorkerId] = useState("");
  const [lastHeartbeat, setLastHeartbeat] = useState("");
  const [currentJob, setCurrentJob] = useState<Job | null>(null);

  const [jobsReceived, setJobsReceived] = useState(0);
  const [jobsCompleted, setJobsCompleted] = useState(0);
  const [jobsFailed, setJobsFailed] = useState(0);

  const [error, setError] = useState("");

  const currentJobRef = useRef<Job | null>(null);
  const workerIdRef = useRef("");
  const claimInFlightRef = useRef(false);
  const executingJobRef = useRef(false);

  useEffect(() => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let jobTimer: ReturnType<typeof setInterval> | null = null;
    let statsTimer: ReturnType<typeof setInterval> | null = null;

    let stopped = false;

    async function loadWorkerStats(currentWorkerId: string) {
      if (!currentWorkerId || stopped) {
        return;
      }

      try {
        const [
          receivedResult,
          completedResult,
          failedResult,
        ] = await Promise.all([
          supabase
            .from("desktop_jobs")
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq("worker_id", currentWorkerId),

          supabase
            .from("desktop_jobs")
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq("worker_id", currentWorkerId)
            .eq("status", "completed"),

          supabase
            .from("desktop_jobs")
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq("worker_id", currentWorkerId)
            .eq("status", "failed"),
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

        setJobsReceived(receivedResult.count ?? 0);
        setJobsCompleted(completedResult.count ?? 0);
        setJobsFailed(failedResult.count ?? 0);
      } catch (err) {
        console.error("Worker statistics error:", err);
      }
    }

    async function registerWorker(userId: string) {
      const { data, error: upsertError } = await supabase
        .from("desktop_workers")
        .upsert(
          {
            user_id: userId,
            worker_name: WORKER_NAME,
            status: "online",
            last_seen: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        )
        .select("id")
        .single();

      if (upsertError) {
        throw upsertError;
      }

      if (!data?.id) {
        throw new Error(
          "Desktop worker registration returned no worker ID."
        );
      }

      return data.id as string;
    }

    async function startWorker() {
      try {
        setStatus("Signing in...");
        setError("");

        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          const {
            data,
            error: signInError,
          } = await supabase.auth.signInAnonymously();

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

        const currentWorkerId = await registerWorker(userId);

        workerIdRef.current = currentWorkerId;
        setWorkerId(currentWorkerId);

        setStatus("Online");

        setLastHeartbeat(
          new Date().toLocaleTimeString()
        );

        await loadWorkerStats(currentWorkerId);

        async function heartbeat() {
          if (stopped) {
            return;
          }

          const { error: heartbeatError } = await supabase
            .from("desktop_workers")
            .update({
              status: "online",
              last_seen: new Date().toISOString(),
            })
            .eq("id", currentWorkerId)
            .eq("user_id", userId);

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

        async function markJobCompleted(jobId: string) {
          const { error: updateError } = await supabase
            .from("desktop_jobs")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              error: null,
            })
            .eq("id", jobId)
            .eq("worker_id", currentWorkerId);

          if (updateError) {
            throw updateError;
          }
        }

        async function markJobFailed(
          jobId: string,
          errorMessage: string
        ) {
          const { error: updateError } = await supabase
            .from("desktop_jobs")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error: errorMessage,
            })
            .eq("id", jobId)
            .eq("worker_id", currentWorkerId);

          if (updateError) {
            throw updateError;
          }
        }

        async function executeJob(
          job: Job
        ): Promise<JobResult> {
          console.log(
            "MIB Desktop executing job:",
            job
          );

          switch (job.job_type) {
            case "background_test": {
              console.log(
                "Running background worker test..."
              );

              await new Promise((resolve) =>
                setTimeout(resolve, 1000)
              );

              console.log(
                "Background worker test completed."
              );

              return {
                success: true,
              };
            }

            case "test_job": {
              console.log(
                "Running MIB test job..."
              );

              await new Promise((resolve) =>
                setTimeout(resolve, 1000)
              );

              console.log(
                "MIB test job completed."
              );

              return {
                success: true,
              };
            }

            default: {
              return {
                success: false,
                error:
                  `Unsupported job type: ${job.job_type}`,
              };
            }
          }
        }

        async function processCurrentJob(job: Job) {
          if (executingJobRef.current) {
            return;
          }

          executingJobRef.current = true;

          try {
            setError("");

            const result = await executeJob(job);

            if (result.success) {
              await markJobCompleted(job.id);

              console.log(
                "MIB Desktop job completed:",
                job.id
              );
            } else {
              const failureMessage =
                result.error ??
                "Job execution failed.";

              await markJobFailed(
                job.id,
                failureMessage
              );

              setError(failureMessage);

              console.error(
                "MIB Desktop job failed:",
                failureMessage
              );
            }
          } catch (err) {
            const failureMessage =
              err instanceof Error
                ? err.message
                : "Unknown job execution error.";

            console.error(
              "MIB Desktop job execution error:",
              err
            );

            try {
              await markJobFailed(
                job.id,
                failureMessage
              );
            } catch (markError) {
              console.error(
                "Unable to mark job as failed:",
                markError
              );
            }

            setError(failureMessage);
          } finally {
            currentJobRef.current = null;
            setCurrentJob(null);
            executingJobRef.current = false;

            await loadWorkerStats(
              currentWorkerId
            );
          }
        }

        async function checkForJob() {
          if (stopped) {
            return;
          }

          if (currentJobRef.current !== null) {
            return;
          }

          if (claimInFlightRef.current) {
            return;
          }

          if (executingJobRef.current) {
            return;
          }

          claimInFlightRef.current = true;

          try {
            const {
              data,
              error: jobError,
            } = await supabase.rpc(
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

            const receivedJob =
              data[0] as Job;

            console.log(
              "MIB Desktop received job:",
              receivedJob
            );

            currentJobRef.current =
              receivedJob;

            setCurrentJob(receivedJob);

            await processCurrentJob(
              receivedJob
            );
          } finally {
            claimInFlightRef.current = false;
          }
        }

        heartbeatTimer = setInterval(
          heartbeat,
          30000
        );

        jobTimer = setInterval(
          checkForJob,
          5000
        );

        statsTimer = setInterval(
          () =>
            loadWorkerStats(
              currentWorkerId
            ),
          10000
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
      stopped = true;

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      if (jobTimer) {
        clearInterval(jobTimer);
      }

      if (statsTimer) {
        clearInterval(statsTimer);
      }
    };
  }, []);

  const statusColor =
    status === "Online"
      ? "#22c55e"
      : status === "Connection failed" ||
        status === "Connection problem"
      ? "#ef4444"
      : "#facc15";

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
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "22px",
              fontWeight: "600",
              color: statusColor,
            }}
          >
            <span
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: statusColor,
                display: "inline-block",
                boxShadow:
                  status === "Online"
                    ? "0 0 10px rgba(34,197,94,0.6)"
                    : "none",
              }}
            />

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
              <span
                style={{
                  color: "#e2e8f0",
                }}
              >
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
            <span
              style={{
                color: "#e2e8f0",
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
                color: "#22c55e",
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
                color: "#f87171",
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
                  fontSize: "20px",
                  fontWeight: "600",
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
                  marginTop: "14px",
                  color: "#facc15",
                  fontSize: "13px",
                }}
              >
                Executing automatically...
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