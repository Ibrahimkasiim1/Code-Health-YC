import "dotenv/config";
import { getSupabase } from "../src/db.js";

/**
 * Delete mock telemetry data from Supabase
 *
 * Usage:
 *   npm run unseed:telemetry                  # Deletes ALL telemetry data
 *   npm run unseed:telemetry <repo_id_uuid>   # Deletes data for specific repo
 */
async function unseedTelemetry() {
  const supabase = getSupabase();
  const repoId = process.argv[2];

  if (repoId) {
    console.log(` Deleting telemetry data for repo ${repoId}...`);
  } else {
    console.log(" Deleting ALL telemetry data...");
  }

  try {
    // Delete from telemetry_events
    let telemetryQuery = supabase.from("telemetry_events").delete();
    if (repoId) {
      telemetryQuery = telemetryQuery.eq("repo_id", repoId);
    } else {
      telemetryQuery = telemetryQuery.neq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { error: telemetryError, count: telemetryCount } = await telemetryQuery;

    if (telemetryError) {
      console.error("Failed to delete telemetry_events:", telemetryError);
    } else {
      console.log(`Deleted ${telemetryCount || 'all'} rows from telemetry_events`);
    }

    // Delete from session_events
    let sessionQuery = supabase.from("session_events").delete();
    if (repoId) {
      sessionQuery = sessionQuery.eq("repo_id", repoId);
    } else {
      sessionQuery = sessionQuery.neq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { error: sessionError, count: sessionCount } = await sessionQuery;

    if (sessionError) {
      console.error("Failed to delete session_events:", sessionError);
    } else {
      console.log(`Deleted ${sessionCount || 'all'} rows from session_events`);
    }

    // Delete from error_events
    let errorQuery = supabase.from("error_events").delete();
    if (repoId) {
      errorQuery = errorQuery.eq("repo_id", repoId);
    } else {
      errorQuery = errorQuery.neq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { error: errorError, count: errorCount } = await errorQuery;

    if (errorError) {
      console.error("Failed to delete error_events:", errorError);
    } else {
      console.log(`Deleted ${errorCount || 'all'} rows from error_events`);
    }

    if (repoId) {
      console.log(`\nTelemetry data for repo ${repoId} deleted successfully!`);
    } else {
      console.log("\nAll telemetry data deleted successfully!");
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
}

unseedTelemetry();

