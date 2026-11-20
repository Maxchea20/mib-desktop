import { pollDelayMs } from "./polling.mjs";
import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import {
  handleTestJob,
} from "./handlers/testJob.mjs";

import {
  handleFacebookGroupPost,
} from "./platforms/facebook/groupPost.mjs";

import {
  handleIpropertyCreateListing,
} from "./platforms/iproperty/createListing.mjs";

import {
  handleGoogleBusinessPost,
} from "./platforms/google/post.mjs";

import {
  createAuthManager,
} from "./auth.mjs";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY;

const ACCESS_TOKEN =
  process.env.MIB_WORKER_ACCESS_TOKEN;

const REFRESH_TOKEN =
  process.env.MIB_WORKER_REFRESH_TOKEN;

if (
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY
) {
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY."
  );

  process.exit(1);
}

if (
  !ACCESS_TOKEN ||
  !REFRESH_TOKEN
) {
  console.error(
    "Missing MIB worker authentication tokens."
  );

  console.error(
    "The worker must be started by MIB Desktop."
  );

  process.exit(1);
}

/*
|--------------------------------------------------------------------------
| SUPABASE CLIENT (WORKER)
|--------------------------------------------------------------------------
|
| Session handling is done only by ./auth.mjs (one refresh at a time,
| fatal errors stop the worker). The client's own auto-refresh is off so
| it cannot race with it.
|
*/

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );

const WORKER_NAME =
  "MIB Desktop";

let workerId = null;

let currentJobId = null;

let heartbeatTimer = null;

let pollTimer = null;

// When the worker last started or finished a job. Polling is fast near this time, slower when quiet.
let lastActivityAt = Date.now();

let exitWhenIdle = false;

function stopTimers() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function shutdownAfterAuthFailure() {
  stopTimers();

  if (currentJobId) {
    // Let the running job finish; exit afterwards (see checkForJobs).
    exitWhenIdle = true;
    return;
  }

  process.exit(2);
}

const auth =
  createAuthManager({
    supabase,
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    onFatal: shutdownAfterAuthFailure,
  });

const ensureFreshSession =
  auth.ensureFreshSession;

// Log the same transient auth problem at most once a minute.
const lastAuthLog = new Map();

function logAuthProblem(label, error) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  if (error?.name === "AuthFatalError") {
    return; // already reported once by auth.mjs
  }

  const key = `${label}:${message}`;
  const last = lastAuthLog.get(key) || 0;

  if (Date.now() - last < 60000) {
    return;
  }

  lastAuthLog.set(key, Date.now());

  console.error(`${label}:`, message);
}

async function registerWorker() {
  const session =
    await ensureFreshSession();

  const userId =
    session.user.id;

  console.log(
    "Worker user:",
    userId
  );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "desktop_workers"
      )
      .upsert(
        {
          user_id:
            userId,

          worker_name:
            WORKER_NAME,

          status:
            "online",

          last_seen:
            new Date().toISOString(),
        },
        {
          onConflict:
            "user_id",
        }
      )
      .select("id")
      .single();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error(
      "Worker registration returned no worker ID."
    );
  }

  workerId =
    data.id;

  console.log(
    "Registered worker:",
    workerId
  );
}

async function heartbeat() {
  if (!workerId || auth.isFatal()) {
    return;
  }

  try {
    await ensureFreshSession();
  } catch (authError) {
    logAuthProblem(
      "Heartbeat authentication error",
      authError
    );
    return;
  }

  const {
    error,
  } =
    await supabase
      .from(
        "desktop_workers"
      )
      .update({
        status:
          "online",

        last_seen:
          new Date().toISOString(),
      })
      .eq(
        "id",
        workerId
      );

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
  const {
    error,
  } =
    await supabase
      .from(
        "desktop_jobs"
      )
      .update({
        status:
          "completed",

        completed_at:
          new Date().toISOString(),

        error:
          null,
      })
      .eq(
        "id",
        jobId
      )
      .eq(
        "worker_id",
        workerId
      );

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
  const {
    error,
  } =
    await supabase
      .from(
        "desktop_jobs"
      )
      .update({
        status:
          "failed",

        completed_at:
          new Date().toISOString(),

        error:
          errorMessage,
      })
      .eq(
        "id",
        jobId
      )
      .eq(
        "worker_id",
        workerId
      );

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

async function executeJob(
  job
) {
  /*
  |--------------------------------------------------------------------------
  | LOAD MIB LISTING DATA
  |--------------------------------------------------------------------------
  |
  | iProperty jobs carry the MIB listing ID inside:
  |
  | job.payload.listing_id
  |
  | Load the complete property record from Supabase once here
  | and pass it through the existing job object as job.listing.
  |
  |--------------------------------------------------------------------------
  */

  if (
    job.job_type ===
      "iproperty_create_listing"
  ) {
    const listingId =
      job.payload?.listing_id;

    if (
      listingId === undefined ||
      listingId === null ||
      listingId === ""
    ) {
      throw new Error(
        "iProperty job is missing payload.listing_id."
      );
    }

    console.log("");

    console.log(
      "Loading MIB listing from Supabase..."
    );

    console.log(
      "Listing ID:",
      listingId
    );

    const {
      data: listing,
      error,
    } =
      await supabase
        .from(
          "properties"
        )
        .select("*")
        .eq(
          "id",
          listingId
        )
        .single();

    if (error) {
      throw new Error(
        `Could not load MIB listing #${listingId}: ${error.message}`
      );
    }

    if (!listing) {
      throw new Error(
        `MIB listing #${listingId} was not found.`
      );
    }

    job.listing =
      listing;

    console.log(
      "✅ MIB listing loaded."
    );

    console.log(
      "Title:",
      listing.title
    );

    console.log(
      "Category:",
      listing.category
    );

    console.log(
      "Purpose:",
      listing.purpose
    );

    console.log(
      "Property Type:",
      listing.property_type
    );

    console.log(
      "Property Sub Type:",
      listing.property_sub_type
    );

    console.log(
      "Unit Type:",
      listing.unit_type
    );

    console.log(
      "Area:",
      listing.area
    );

    console.log(
      "City:",
      listing.city
    );

    console.log(
      "State:",
      listing.state
    );

    console.log(
      "Bedrooms:",
      listing.bedrooms
    );

    console.log(
      "Bathrooms:",
      listing.bathrooms
    );

    console.log(
      "Built-up:",
      listing.built_up
    );

    console.log(
      "Land size:",
      listing.land_size
    );

    console.log(
      "Parking:",
      listing.parking_spaces
    );

    console.log(
      "Furnishing:",
      listing.furnishing
    );

    console.log("");
  }

  switch (
    job.job_type
  ) {
    case "test_job":
    case "background_test":
      return await handleTestJob(
        job
      );

    case "facebook_group_post":
      return await handleFacebookGroupPost(
        job
      );

    case "iproperty_create_listing": {
      const session =
        await ensureFreshSession();

      return await handleIpropertyCreateListing(
        job,
        session.access_token
      );
    }

    case "generate_property_video": {
      const session =
        await ensureFreshSession();

      // Loaded on demand so the worker still starts when the optional
      // video module is not installed on this machine.
      const {
        handleGeneratePropertyVideo,
      } = await import(
        "./handlers/videoGeneration.mjs"
      );

      return await handleGeneratePropertyVideo(
        job,
        session.access_token,
        supabase
      );
    }

    case "google_business_post":
      return await handleGoogleBusinessPost(
        job
      );

    default:
      throw new Error(
        `No handler registered for job type: ${job.job_type}`
      );
  }
}

async function checkForJobs() {
  if (!workerId || auth.isFatal()) {
    return;
  }

  if (currentJobId) {
    return;
  }

  // No valid session -> no job is claimed or run.
  try {
    await ensureFreshSession();
  } catch (authError) {
    logAuthProblem(
      "Job polling authentication error",
      authError
    );
    return;
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "claim_next_desktop_job",
      {
        p_worker_id:
          workerId,
      }
    );

  if (error) {
    console.error(
      "Job check error:",
      error.message
    );

    return;
  }

  if (
    !data ||
    data.length === 0
  ) {
    return;
  }

  const job =
    data[0];

  lastActivityAt = Date.now();

  currentJobId =
    job.id;

  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "NEW MIB JOB"
  );

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
    "Payload:",
    JSON.stringify(
      job.payload,
      null,
      2
    )
  );

  console.log(
    "================================="
  );

  console.log("");

  try {
    const result =
      await executeJob(
        job
      );

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
    currentJobId =
      null;

    lastActivityAt = Date.now();

    if (exitWhenIdle) {
      process.exit(2);
    }
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

    heartbeatTimer =
      setInterval(
        heartbeat,
        30000
      );

    // One check at a time, then wait (5 s while busy, 15 s when quiet).
    const schedulePoll = () => {
      pollTimer = setTimeout(async () => {
        try {
          await checkForJobs();
        } catch (pollError) {
          console.error("Job polling error:", pollError instanceof Error ? pollError.message : pollError);
        } finally {
          // stopTimers() sets pollTimer to null: then no further check is scheduled.
          if (pollTimer !== null) schedulePoll();
        }
      }, pollDelayMs(Date.now(), lastActivityAt));
    };

    schedulePoll();
    await checkForJobs();
  } catch (error) {
    console.error("");

    console.error(
      "🔴 Worker startup failed:"
    );

    console.error(
      error
    );

    console.error("");

    process.exit(1);
  }
}

startWorker();