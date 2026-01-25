/**
 * Seed mock telemetry data for testing agents
 * Run with: npm run seed:telemetry
 *
 * Usage:
 *   npm run seed:telemetry                    # Seeds for first connected repo
 *   npm run seed:telemetry <repo_id_uuid>     # Seeds for specific repo
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Get repo_id from command line args or fetch from database
async function getRepoId(): Promise<string> {
  const argRepoId = process.argv[2];
  if (argRepoId) {
    console.log(`Using repo_id from command line: ${argRepoId}`);
    return argRepoId;
  }

  // Fetch the first connected repository
  const { data, error } = await supabase
    .from("connected_repositories")
    .select("id, repo_full_name")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("No connected repositories found. Please connect a repository first or provide repo_id as argument.");
  }

  console.log(`Using first connected repository: ${data.repo_full_name} (${data.id})`);
  return data.id;
}

async function seedTelemetryEvents(repoId: string) {
  console.log("Seeding telemetry events...");

  const now = new Date();
  const events = [];

  // Generate realistic API telemetry data
  const endpoints = [
    "/api/users",
    "/api/posts",
    "/api/auth/login",
    "/api/auth/signup",
    "/api/products",
    "/api/checkout",
    "/api/search",
  ];

  for (let i = 0; i < 500; i++) {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000); // Last 7 days

    // Simulate performance issues on some endpoints
    let duration_ms;
    if (endpoint === "/api/search" && Math.random() > 0.7) {
      duration_ms = 2000 + Math.random() * 3000; // Slow searches (2-5s)
    } else if (endpoint === "/api/checkout" && Math.random() > 0.8) {
      duration_ms = 1500 + Math.random() * 2000; // Slow checkouts (1.5-3.5s)
    } else {
      duration_ms = 50 + Math.random() * 200; // Normal (50-250ms)
    }

    events.push({
      repo_id: repoId, // ✅ FIXED: Add repo_id for filtering
      endpoint,
      event_type: "api_call",
      duration_ms: Math.round(duration_ms),
      user_id: null, // Set to null since we don't have real user UUIDs
      request_hash: `hash_${i}`,
      metadata: {
        method: Math.random() > 0.7 ? "POST" : "GET",
        status: Math.random() > 0.95 ? 500 : 200,
      },
      timestamp: timestamp.toISOString(),
    });
  }

  const { error } = await supabase.from("telemetry_events").insert(events);
  if (error) {
    console.error("Error seeding telemetry events:", error);
  } else {
    console.log(`✅ Created ${events.length} telemetry events for repo ${repoId}`);
  }
}

async function seedSessionEvents(repoId: string) {
  console.log("Seeding session events...");

  const now = new Date();
  const sessions = [];

  const pages = [
    "/",
    "/dashboard",
    "/profile",
    "/settings",
    "/products",
    "/checkout",
    "/search",
  ];

  for (let i = 0; i < 200; i++) {
    const page = pages[Math.floor(Math.random() * pages.length)];
    const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    // Simulate bounce rate issues on some pages
    let duration_ms;
    if (page === "/checkout" && Math.random() > 0.6) {
      duration_ms = 2000 + Math.random() * 3000; // Quick exits from checkout
    } else {
      duration_ms = 10000 + Math.random() * 120000; // 10s - 2min
    }

    sessions.push({
      repo_id: repoId, // ✅ FIXED: Add repo_id for filtering
      session_id: `session_${i}`,
      page_url: page,
      duration_ms: Math.round(duration_ms),
      timestamp: timestamp.toISOString(),
    });
  }

  const { error } = await supabase.from("session_events").insert(sessions);
  if (error) {
    console.error("Error seeding session events:", error);
  } else {
    console.log(`✅ Created ${sessions.length} session events for repo ${repoId}`);
  }
}

async function seedErrorEvents(repoId: string) {
  console.log("Seeding error events...");

  const now = new Date();
  const errors = [];

  const errorMessages = [
    "TypeError: Cannot read property 'id' of undefined",
    "ReferenceError: user is not defined",
    "Error: Database connection timeout",
    "Error: Payment gateway returned 500",
    "TypeError: Cannot read property 'map' of null",
    "Error: Invalid API key",
  ];

  for (let i = 0; i < 50; i++) {
    const errorMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    errors.push({
      repo_id: repoId, // ✅ FIXED: Add repo_id for filtering
      error_message: errorMessage,
      stack_trace: `Error: ${errorMessage}\n    at Object.<anonymous> (/app/src/index.ts:${Math.floor(Math.random() * 100)}:${Math.floor(Math.random() * 50)})`,
      endpoint: "/api/users",
      user_id: null, // Set to null since we don't have real user UUIDs
      timestamp: timestamp.toISOString(),
    });
  }

  const { error } = await supabase.from("error_events").insert(errors);
  if (error) {
    console.error("Error seeding error events:", error);
  } else {
    console.log(`✅ Created ${errors.length} error events for repo ${repoId}`);
  }
}

async function main() {
  console.log("🌱 Seeding mock telemetry data...\n");

  try {
    const repoId = await getRepoId();
    console.log(`\nSeeding telemetry data for repo_id: ${repoId}\n`);

    await seedTelemetryEvents(repoId);
    await seedSessionEvents(repoId);
    await seedErrorEvents(repoId);

    console.log("\n✅ Mock telemetry data seeded successfully!");
    console.log(`Agents can now analyze this data for repo ${repoId}`);
    console.log("\nTo seed for a different repository, run:");
    console.log("  npm run seed:telemetry <repo_id_uuid>");
  } catch (err) {
    console.error("❌ Failed to seed telemetry data:", err);
    process.exit(1);
  }
}

main();

