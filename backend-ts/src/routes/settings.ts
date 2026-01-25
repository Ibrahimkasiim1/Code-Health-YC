import { Hono } from "hono";
import { getSupabase } from "../db.js";
import { authMiddleware, getCurrentUser } from "../middleware/auth.js";
import { z } from "zod";

const settings = new Hono();

settings.use("*", authMiddleware);

// Schema for MCP/Supabase configuration
const mcpConfigSchema = z.object({
  supabase_url: z.string().url("Invalid Supabase URL"),
  supabase_service_key: z.string().min(10, "Invalid service key"),
  project_name: z.string().optional(),
});

// Get user's MCP configuration
settings.get("/mcp-config", async (c) => {
  const user = getCurrentUser(c);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("user_settings")
    .select("supabase_url, supabase_project_name, mcp_configured, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return c.json({ detail: "Failed to fetch settings" }, 500);
  }

  // Don't return the actual key, just indicate if it's configured
  return c.json({
    configured: !!data?.mcp_configured,
    supabase_url: data?.supabase_url || null,
    project_name: data?.supabase_project_name || null,
    updated_at: data?.updated_at || null,
  });
});

// Save user's MCP configuration
settings.post("/mcp-config", async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);

  const parsed = mcpConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ detail: parsed.error.errors[0].message }, 400);
  }

  const { supabase_url, supabase_service_key, project_name } = parsed.data;
  const supabase = getSupabase();

  // Verify the Supabase credentials work by making a test request
  try {
    const testClient = (await import("@supabase/supabase-js")).createClient(
      supabase_url,
      supabase_service_key
    );
    // Try a simple query to verify connection
    const { error: testError } = await testClient.from("_test_connection").select("*").limit(1);
    // We expect this to fail with "relation does not exist" which is fine
    // What we don't want is auth errors
    if (testError && testError.message.includes("Invalid API key")) {
      return c.json({ detail: "Invalid Supabase API key" }, 400);
    }
  } catch (err) {
    return c.json({ detail: "Failed to connect to Supabase. Please check your credentials." }, 400);
  }

  // Check if settings already exist
  const { data: existing } = await supabase
    .from("user_settings")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    supabase_url,
    supabase_service_key_encrypted: supabase_service_key, // In production, encrypt this!
    supabase_project_name: project_name || null,
    mcp_configured: true,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("user_settings")
      .update(payload)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to update settings:", error);
      return c.json({ detail: "Failed to save settings" }, 500);
    }
  } else {
    const { error } = await supabase.from("user_settings").insert(payload);

    if (error) {
      console.error("Failed to insert settings:", error);
      return c.json({ detail: "Failed to save settings" }, 500);
    }
  }

  return c.json({
    success: true,
    message: "MCP configuration saved successfully",
  });
});

// Delete user's MCP configuration
settings.delete("/mcp-config", async (c) => {
  const user = getCurrentUser(c);
  const supabase = getSupabase();

  const { error } = await supabase
    .from("user_settings")
    .update({
      supabase_url: null,
      supabase_service_key_encrypted: null,
      supabase_project_name: null,
      mcp_configured: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return c.json({ detail: "Failed to delete configuration" }, 500);
  }

  return c.json({ success: true });
});

// Get MCP connection details (for generating Claude Desktop config)
settings.get("/mcp-connection", async (c) => {
  const user = getCurrentUser(c);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("user_settings")
    .select("supabase_url, supabase_service_key_encrypted, mcp_configured")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.mcp_configured) {
    return c.json({ detail: "MCP not configured" }, 404);
  }

  // Generate the Claude Desktop config for this user
  const claudeConfig = {
    mcpServers: {
      "code-health": {
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-code-health"],
        env: {
          SUPABASE_URL: data.supabase_url,
          SUPABASE_SERVICE_KEY: data.supabase_service_key_encrypted,
          USER_ID: user.id,
        },
      },
    },
  };

  return c.json({
    configured: true,
    user_id: user.id,
    claude_desktop_config: claudeConfig,
    instructions: [
      "1. Copy the config below to your Claude Desktop configuration",
      "2. On macOS: ~/Library/Application Support/Claude/claude_desktop_config.json",
      "3. On Windows: %APPDATA%\\Claude\\claude_desktop_config.json",
      "4. Restart Claude Desktop",
      "5. Look for the hammer icon (🔨) to see available tools",
    ],
  });
});

export default settings;
