export async function handleTestJob(job) {
  console.log("");
  console.log("=================================");
  console.log("RUNNING TEST JOB");
  console.log("=================================");
  console.log("Job ID:", job.id);
  console.log("Job Type:", job.job_type);
  console.log(
    "Payload:",
    JSON.stringify(job.payload, null, 2)
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 2000)
  );

  console.log("Test job completed.");
  console.log("=================================");
  console.log("");

  return {
    success: true,
    message: "Test job completed successfully.",
  };
}