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

  // Telemetry table isn't part of the MVP schema; accept payload for now.
  return c.json({ ingested: true });
});

export default webhooks;
