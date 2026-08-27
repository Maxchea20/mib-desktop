import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "SUPABASE_URL is missing."
  );
}

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    "SUPABASE_ANON_KEY is missing."
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

/*
|--------------------------------------------------------------------------
| GET LISTING
|--------------------------------------------------------------------------
*/

export async function getListing(
  listingId
) {
  if (
    listingId === undefined ||
    listingId === null ||
    listingId === ""
  ) {
    throw new Error(
      "Listing ID is required."
    );
  }

  console.log(
    `Fetching MIB listing #${listingId}...`
  );

  const {
    data,
    error,
  } = await supabase
    .from("properties")
    .select("*")
    .eq("id", listingId)
    .single();

  if (error) {
    throw new Error(
      `Failed to fetch listing #${listingId}: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `Listing #${listingId} was not found.`
    );
  }

  console.log(
    `Listing #${listingId} loaded: ${data.title || "Untitled"}`
  );

  return data;
}