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

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

const WORKER_NAME =
  "MIB Desktop";

let workerId = null;

let currentJobId = null;

async function authenticate() {
  console.log(
    "Authenticating worker using MIB Desktop session..."
  );

  const {
    data,
    error,
  } =
    await supabase.auth.setSession({
      access_token:
        ACCESS_TOKEN,

      refresh_token:
        REFRESH_TOKEN,
    });

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error(
      "Unable to establish worker session."
    );
  }

  console.log(
    "Worker authenticated as:",
    data.session.user.id
  );

  return data.session;
}

async function registerWorker() {
  const session =
    await authenticate();

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
  if (!workerId) {
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

    case "iproperty_create_listing":
      return await handleIpropertyCreateListing(
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

    console.error(
      error
    );

    console.error("");

    process.exit(1);
  }
}

startWorker();