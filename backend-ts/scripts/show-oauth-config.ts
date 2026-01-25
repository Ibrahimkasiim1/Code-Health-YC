/**
 * Script to display current GitHub OAuth configuration
 * Run with: npx tsx scripts/show-oauth-config.ts
 */

import { config } from "dotenv";
import { getConfig, getGitHubOAuthConfig } from "../src/config.js";

// Load .env file
config();

console.log("\n🔧 GitHub OAuth Configuration\n");
console.log("=" .repeat(60));

try {
  const config = getConfig();
  const oauthConfig = getGitHubOAuthConfig();

  console.log("\n📋 Environment Variables:");
  console.log(`   FRONTEND_URL: ${config.FRONTEND_URL}`);
  console.log(`   GITHUB_CLIENT_ID: ${config.GITHUB_CLIENT_ID}`);
  console.log(`   GITHUB_CLIENT_SECRET: ${config.GITHUB_CLIENT_SECRET.substring(0, 10)}...`);

  console.log("\n🔗 OAuth Configuration:");
  console.log(`   Client ID: ${oauthConfig.clientId}`);
  console.log(`   Redirect URI: ${oauthConfig.redirectUri}`);

  console.log("\n✅ GitHub OAuth App Settings:");
  console.log("   Go to: https://github.com/settings/developers");
  console.log(`   Application name: Your App Name`);
  console.log(`   Homepage URL: ${config.FRONTEND_URL}`);
  console.log(`   Authorization callback URL: ${oauthConfig.redirectUri}`);

  console.log("\n⚠️  IMPORTANT:");
  console.log("   1. The callback URL in GitHub MUST match exactly:");
  console.log(`      ${oauthConfig.redirectUri}`);
  console.log("   2. No trailing slashes");
  console.log("   3. No extra spaces");
  console.log("   4. Case-sensitive");

  console.log("\n🌐 For Vercel Deployment:");
  console.log("   You'll need to add another OAuth App or update the callback URL to:");
  console.log("   https://your-app.vercel.app/auth/github/callback");
  console.log("   And set FRONTEND_URL in Vercel environment variables");

  console.log("\n" + "=".repeat(60) + "\n");
} catch (error) {
  console.error("❌ Error loading configuration:", error);
  console.log("\n💡 Make sure you have a .env file with:");
  console.log("   SUPABASE_URL=...");
  console.log("   SUPABASE_SERVICE_KEY=...");
  console.log("   GITHUB_CLIENT_ID=...");
  console.log("   GITHUB_CLIENT_SECRET=...");
  console.log("   GEMINI_API_KEY=...");
  console.log("   JWT_SECRET=...");
  console.log("   FRONTEND_URL=http://localhost:5173\n");
  process.exit(1);
}

