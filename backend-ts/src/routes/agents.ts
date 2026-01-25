import { Hono } from "hono";
import { getSupabase } from "../db.js";
import { authMiddleware, getCurrentUser } from "../middleware/auth.js";
import { analyzeSchema, generateFixSchema } from "../types/index.js";
import { ContextAgent } from "../agents/context.js";
import { BusinessIntelAgent } from "../agents/businessIntel.js";
import { FixAgent } from "../agents/fix.js";

const agents = new Hono();

agents.use("*", authMiddleware);

agents.post("/analyze", async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);
  const parsed = analyzeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ detail: "Invalid analysis payload" }, 400);
  }

  const { repo_id, total_users, total_requests } = parsed.data;
  const supabase = getSupabase();

  const { data: repo, error } = await supabase
    .from("connected_repositories")
    .select("*, github_installations!inner(user_id, access_token_encrypted)")
    .eq("id", repo_id)
    .single();

  if (error || !repo) {
    return c.json({ detail: "Repository not found" }, 404);
  }

  if (repo.github_installations.user_id !== user.id) {
    return c.json({ detail: "Access denied" }, 403);
  }

  const accessToken = repo.github_installations.access_token_encrypted;
  const [owner, repoName] = repo.repo_full_name.split("/");

  const contextAgent = new ContextAgent();
  const context = await contextAgent.run(accessToken, owner, repoName, repo_id);

  const bizAgent = new BusinessIntelAgent();
  const issues = await bizAgent.run(
    user.id,
    repo_id,
    accessToken,
    owner,
    repoName,
    total_users ?? 100,
    total_requests ?? 10000
  );

  return c.json({
    success: true,
    context,
    issues_found: issues.length,
    issues: issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
    })),
  });
});

agents.post("/generate-fix", async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);
  const parsed = generateFixSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ detail: "Invalid fix payload" }, 400);
  }

  const { issue_id } = parsed.data;
  const supabase = getSupabase();

  const { data: issue, error } = await supabase
    .from("issues")
    .select(
      "*, connected_repositories!inner(repo_full_name, github_installations!inner(user_id, access_token_encrypted))"
    )
    .eq("id", issue_id)
    .single();

  if (error || !issue) {
    return c.json({ detail: "Issue not found" }, 404);
  }

  if (issue.connected_repositories.github_installations.user_id !== user.id) {
    return c.json({ detail: "Access denied" }, 403);
  }

  const { data: existingFix } = await supabase
    .from("fixes")
    .select("*")
    .eq("issue_id", issue_id)
    .maybeSingle();

  if (existingFix) {
    return c.json({ success: true, fix: existingFix, cached: true });
  }

  const accessToken = issue.connected_repositories.github_installations.access_token_encrypted;
  const [owner, repoName] = issue.connected_repositories.repo_full_name.split("/");

  const fixAgent = new FixAgent();
  const fix = await fixAgent.generateFix(issue_id, accessToken, owner, repoName);

  if (!fix) {
    return c.json({ detail: "Failed to generate fix" }, 500);
  }

  return c.json({ success: true, fix, cached: false });
});

export default agents;
