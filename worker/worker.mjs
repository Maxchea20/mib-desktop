import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { handleTestJob } from "./handlers/testJob.mjs";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY."
  );

  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const WORKER_NAME = "MIB Desktop";

let workerId = null;

let currentJobId = null;

async function authenticate() {
  console.log("Authenticating worker...");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    return session;
  }

  const { data, error } =
    await supabase.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error(
      "Worker authentication failed."
    );
  }

  return data.session;
}

async function registerWorker() {
  const session = await authenticate();

  const userId = session.user.id;

  console.log(
    "Worker user:",
    userId
  );

  const {
    data: existingWorker,
    error: findError,
  } = await supabase
    .from("desktop_workers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (existingWorker) {
    workerId = existingWorker.id;

    const { error } =
      await supabase
        .from("desktop_workers")
        .update({
          worker_name: WORKER_NAME,
          status: "online",
          last_seen:
            new Date().toISOString(),
        })
        .eq("id", workerId);

    if (error) {
      throw error;
    }

    return;
  }

  const {
    data: newWorker,
    error: insertError,
  } = await supabase
    .from("desktop_workers")
    .insert({
      user_id: userId,
      worker_name: WORKER_NAME,
      status: "online",
      last_seen:
        new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  workerId = newWorker.id;
}

async function heartbeat() {
  if (!workerId) {
    return;
  }

  const { error } =
    await supabase
      .from("desktop_workers")
      .update({
        status: "online",
        last_seen:
          new Date().toISOString(),
      })
      .eq("id", workerId);

  if (error) {
    console.error(
      "Heartbeat error:",
      error.message
    );

    return;
  }

  console.log(
    `[${new Date().toLocaleTimeString()}] Worker online`
  );
}

async function completeJob(
  jobId,
  result
) {
  const { error } =
    await supabase
      .from("desktop_jobs")
      .update({
        status: "completed",
        completed_at:
          new Date().toISOString(),
        error: null,
      })
      .eq("id", jobId)
      .eq("worker_id", workerId);

  if (error) {
    throw error;
  }

  console.log(
    "✅ Job completed:",
    jobId
  );

  console.log(
    "Result:",
    JSON.stringify(
      result,
      null,
      2
    )
  );
}

async function failJob(
  jobId,
  errorMessage
) {
  const { error } =
    await supabase
      .from("desktop_jobs")
      .update({
        status: "failed",
        completed_at:
          new Date().toISOString(),
        error: errorMessage,
      })
      .eq("id", jobId)
      .eq("worker_id", workerId);

  if (error) {
    console.error(
      "Failed to update failed job:",
      error.message
    );

    return;
  }

  console.error(
    "❌ Job failed:",
    jobId
  );

  console.error(
    "Reason:",
    errorMessage
  );
}

async function executeJob(job) {
  switch (job.job_type) {
    case "test_job":
    case "background_test":
      return await handleTestJob(
        job
      );

    default:
      throw new Error(
        `No handler registered for job type: ${job.job_type}`
      );
  }
}

async function checkForJobs() {
  if (!workerId) {
    return;
  }

  if (currentJobId) {
    return;
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "claim_next_desktop_job",
    {
      p_worker_id: workerId,
    }
  );

  if (error) {
    console.error(
      "Job check error:",
      error.message
    );

    return;
  }

  if (!data || data.length === 0) {
    return;
  }

  const job = data[0];

  currentJobId = job.id;

  console.log("");
  console.log(
    "================================="
  );
  console.log("NEW MIB JOB");
  console.log(
    "================================="
  );
  console.log(
    "Job ID:",
    job.id
  );
  console.log(
    "Job Type:",
    job.job_type
  );
  console.log(
    "================================="
  );
  console.log("");

  try {
    const result =
      await executeJob(job);

    await completeJob(
      job.id,
      result
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown job error.";

    await failJob(
      job.id,
      message
    );
  } finally {
    currentJobId = null;
  }
}

async function startWorker() {
  try {
    console.log("");
    console.log(
      "================================="
    );
    console.log(
      "MIB DESKTOP WORKER"
    );
    console.log(
      "================================="
    );
    console.log("");

    await registerWorker();

    console.log(
      "Worker ID:",
      workerId
    );

    console.log("");

    console.log(
      "🟢 MIB Desktop Worker ONLINE"
    );

    console.log("");

    await heartbeat();

    setInterval(
      heartbeat,
      30000
    );

    setInterval(
      checkForJobs,
      5000
    );

    await checkForJobs();

  } catch (error) {
    console.error("");

    console.error(
      "🔴 Worker startup failed:"
    );

    console.error(error);

    console.error("");

    process.exit(1);
  }
}

startWorker();