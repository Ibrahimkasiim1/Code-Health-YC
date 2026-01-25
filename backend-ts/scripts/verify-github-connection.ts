/**
 * Script to verify GitHub OAuth connection status
 * Run with: npx tsx scripts/verify-github-connection.ts <user-email>
 */

import { config } from "dotenv";
import { getSupabase } from "../src/db.js";

// Load .env file
config();

async function verifyGitHubConnection(userEmail: string) {
  const supabase = getSupabase();

  console.log(`\n🔍 Checking GitHub connection for user: ${userEmail}\n`);

  // Get user
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email, created_at")
    .eq("email", userEmail)
    .single();

  if (userError || !user) {
    console.error("❌ User not found:", userError?.message);
    process.exit(1);
  }

  console.log("✅ User found:");
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Created: ${user.created_at}\n`);

  // Check GitHub installation
  const { data: installation, error: installError } = await supabase
    .from("github_installations")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (installError) {
    console.error("❌ Error checking GitHub installation:", installError.message);
    process.exit(1);
  }

  if (!installation) {
    console.log("❌ No GitHub installation found for this user");
    console.log("\n💡 Next steps:");
    console.log("   1. Make sure the backend server is running");
    console.log("   2. Click 'Connect GitHub' in the Dashboard");
    console.log("   3. Complete the OAuth flow");
    console.log("   4. Run this script again\n");
    process.exit(0);
  }

  console.log("✅ GitHub installation found:");
  console.log(`   Installation ID: ${installation.id}`);
  console.log(`   Created: ${installation.created_at}`);
  console.log(`   GitHub Installation ID: ${installation.installation_id || "N/A"}`);
  console.log(`   Has Access Token: ${installation.access_token_encrypted ? "✅ Yes" : "❌ No"}`);
  console.log(`   Has Refresh Token: ${installation.refresh_token_encrypted ? "✅ Yes" : "❌ No"}\n`);

  if (!installation.access_token_encrypted) {
    console.log("⚠️  WARNING: Access token is missing!");
    console.log("   This means the OAuth flow didn't complete successfully.");
    console.log("\n💡 Troubleshooting:");
    console.log("   1. Check backend logs for errors during OAuth callback");
    console.log("   2. Verify GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env");
    console.log("   3. Try disconnecting and reconnecting GitHub\n");
    process.exit(1);
  }

  // Check connected repositories
  const { data: repos, error: reposError } = await supabase
    .from("connected_repositories")
    .select("*")
    .eq("installation_id", installation.id);

  if (reposError) {
    console.error("❌ Error checking repositories:", reposError.message);
    process.exit(1);
  }

  console.log(`📦 Connected Repositories: ${repos?.length || 0}`);
  if (repos && repos.length > 0) {
    repos.forEach((repo, index) => {
      console.log(`   ${index + 1}. ${repo.repo_full_name} (${repo.default_branch})`);
    });
  } else {
    console.log("   No repositories connected yet");
    console.log("\n💡 Next steps:");
    console.log("   1. Go to the Dashboard");
    console.log("   2. Select a repository from the dropdown");
    console.log("   3. The repository will be cached for analysis\n");
  }

  console.log("\n✅ GitHub OAuth connection is working correctly!\n");
}

// Get email from command line args
const email = process.argv[2];

if (!email) {
  console.error("❌ Please provide a user email");
  console.log("\nUsage: npx tsx scripts/verify-github-connection.ts <user-email>");
  console.log("Example: npx tsx scripts/verify-github-connection.ts user@example.com\n");
  process.exit(1);
}

verifyGitHubConnection(email).catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});

