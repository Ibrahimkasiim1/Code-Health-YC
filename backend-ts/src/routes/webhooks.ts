import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { getConfig } from "../config.js";
import { getSupabase } from "../db.js";

const webhooks = new Hono();

function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

webhooks.post("/github", async (c) => {
  const config = getConfig();
  const signature = c.req.header("x-hub-signature-256") || "";
  const event = c.req.header("x-github-event") || "";

  const rawBody = await c.req.text();

  if (config.GITHUB_WEBHOOK_SECRET) {
    if (!signature) {
      return c.json({ detail: "Missing signature" }, 401);
    }
    if (!verifySignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)) {
      return c.json({ detail: "Invalid signature" }, 401);
    }
  }

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(rawBody);
  } catch {
    return c.json({ detail: "Invalid JSON payload" }, 400);
  }

  const supabase = getSupabase();

  if (event === "push") {
    return c.json({ status: "received", action: "reanalyze_queued" });
  }

  if (event === "pull_request") {
    const action = (data as { action?: string }).action;
    const prNumber = (data as { number?: number }).number;

    if (action === "closed" || action === "merged") {
      const merged = Boolean((data as { pull_request?: { merged?: boolean } }).pull_request?.merged);
      const newStatus = merged ? "merged" : "closed";

      await supabase
        .from("pull_requests")
        .update({ status: newStatus })
        .eq("pr_number", prNumber ?? -1);

      if (merged && prNumber) {
        const { data: pr } = await supabase
          .from("pull_requests")
          .select("fix_id")
          .eq("pr_number", prNumber)
          .maybeSingle();

        if (pr?.fix_id) {
          const { data: fix } = await supabase
            .from("fixes")
            .select("issue_id")
            .eq("id", pr.fix_id)
            .maybeSingle();

          if (fix?.issue_id) {
            await supabase.from("issues").update({ status: "resolved" }).eq("id", fix.issue_id);
          }
        }
      }

      return c.json({ status: "received", action: `pr_${newStatus}` });
    }
  }

  if (event === "installation") {
    const action = (data as { action?: string }).action;
    const installationId = (data as { installation?: { id?: number } }).installation?.id;

    if (action === "deleted" && installationId) {
      await supabase
        .from("github_installations")
        .delete()
        .eq("installation_id", installationId);
      return c.json({ status: "received", action: "installation_removed" });
    }
  }

  return c.json({ status: "received", event });
});

webhooks.post("/ingest", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ detail: "Invalid payload" }, 400);
  }

  const supabase = getSupabase();
  const eventType = body.event_type;

  try {
    if (eventType === "telemetry" || eventType === "api_call") {
      // ✅ FIXED: Include repo_id in telemetry events
      await supabase.from("telemetry_events").insert({
        repo_id: body.repo_id || null, // CRITICAL FIX
        endpoint: body.endpoint,
        event_type: body.event_type || "api_call",
        duration_ms: body.duration_ms,
        user_id: body.user_id || null,
        request_hash: body.request_hash || null,
        metadata: body.metadata || {},
        timestamp: body.timestamp || new Date().toISOString(),
      });
    } else if (eventType === "session" || eventType === "page_view") {
      // ✅ FIXED: Include repo_id in session events
      await supabase.from("session_events").insert({
        repo_id: body.repo_id || null, // CRITICAL FIX
        session_id: body.session_id,
        page_url: body.page_url,
        duration_ms: body.duration_ms || 0,
        timestamp: body.timestamp || new Date().toISOString(),
      });
    } else if (eventType === "error") {
      // ✅ FIXED: Include repo_id in error events
      await supabase.from("error_events").insert({
        repo_id: body.repo_id || null, // CRITICAL FIX
        error_message: body.error_message,
        stack_trace: body.stack_trace || null,
        endpoint: body.endpoint || null,
        user_id: body.user_id || null,
        timestamp: body.timestamp || new Date().toISOString(),
      });
    } else {
      // Unknown event type - store as generic telemetry with repo_id
      await supabase.from("telemetry_events").insert({
        repo_id: body.repo_id || null, // CRITICAL FIX
        endpoint: body.endpoint || "unknown",
        event_type: eventType || "unknown",
        duration_ms: body.duration_ms || 0,
        metadata: body,
        timestamp: body.timestamp || new Date().toISOString(),
      });
    }

    return c.json({ ingested: true, event_type: eventType });
  } catch (error) {
    console.error("[Webhooks] Failed to ingest telemetry:", error);
    return c.json({ detail: "Failed to ingest telemetry", error: String(error) }, 500);
  }
});

export default webhooks;
