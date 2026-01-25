import { Hono } from "hono";
import { getSupabase } from "../db.js";
import { authMiddleware, getCurrentUser } from "../middleware/auth.js";
import { analyzeSchema, generateFixSchema } from "../types/index.js";
import { orchestrator, configureLangSmith, AgentContext } from "../langchain/index.js";

const agents = new Hono();

agents.use("*", authMiddleware);

// Initialize LangSmith on module load
configureLangSmith();

agents.post("/analyze", async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);
  const parsed = analyzeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ detail: "Invalid analysis payload" }, 400);
  }

  const { repo_id } = parsed.data;
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

  // Build agent context
  const context: AgentContext = {
    repoId: repo_id,
    owner,
    repo: repoName,
    accessToken,
  };

  // Run full analysis using the orchestrator
  const result = await orchestrator.analyzeRepository(context);

  return c.json({
    success: true,
    context: result.repository_context,
    issues_found: result.all_issues.length,
    issues: result.all_issues.map((issue) => ({
      id: issue.issue_id,
      title: issue.title,
      severity: issue.severity,
      type: issue.type,
      agent: issue.agent,
    })),
    summary: result.summary,
    execution_time_ms: result.execution_time_ms,
    agent_results: result.agent_results.map((r) => ({
      agent: r.agent_name,
      status: r.status,
      issues_found: r.issues.length,
      execution_time_ms: r.execution_time_ms,
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
      "*, connected_repositories!inner(id, repo_full_name, github_installations!inner(user_id, access_token_encrypted))"
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

  // Build agent context
  const context: AgentContext = {
    repoId: issue.connected_repositories.id,
    owner,
    repo: repoName,
    accessToken,
  };

  // Generate fix using the orchestrator
  const fix = await orchestrator.generateFix(context, issue_id);

  if (!fix) {
    return c.json({ detail: "Failed to generate fix" }, 500);
  }

  // Save fix to database
  const { data: savedFix, error: saveError } = await supabase
    .from("fixes")
    .insert({
      issue_id,
      file_path: fix.fix.file_path,
      original_code: fix.fix.original_code,
      fixed_code: fix.fix.fixed_code,
      start_line: fix.fix.start_line,
      end_line: fix.fix.end_line,
      explanation: fix.fix.explanation,
      pr_title: fix.pr_description.title,
      pr_body: fix.pr_description.body,
    })
    .select()
    .single();

  if (saveError) {
    console.error("Failed to save fix:", saveError);
  }

  return c.json({ success: true, fix: savedFix || fix, cached: false });
});

// Get analysis status/results for a repository
agents.get("/analysis/:repo_id", async (c) => {
  const user = getCurrentUser(c);
  const repoId = c.req.param("repo_id");
  const supabase = getSupabase();

  const { data: repo, error } = await supabase
    .from("connected_repositories")
    .select("*, github_installations!inner(user_id)")
    .eq("id", repoId)
    .single();

  if (error || !repo) {
    return c.json({ detail: "Repository not found" }, 404);
  }

  if (repo.github_installations.user_id !== user.id) {
    return c.json({ detail: "Access denied" }, 403);
  }

  // Get issues for this repository
  const { data: issues } = await supabase
    .from("issues")
    .select("*")
    .eq("repo_id", repoId)
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false });

  // Get repository context
  const { data: context } = await supabase
    .from("repository_contexts")
    .select("*")
    .eq("repo_id", repoId)
    .single();

  // Generate summary
  const summary = {
    total_issues: issues?.length || 0,
    by_severity: {} as Record<string, number>,
    by_type: {} as Record<string, number>,
  };

  for (const issue of issues || []) {
    summary.by_severity[issue.severity] = (summary.by_severity[issue.severity] || 0) + 1;
    summary.by_type[issue.issue_type] = (summary.by_type[issue.issue_type] || 0) + 1;
  }

  return c.json({
    repository_context: context?.context_json || null,
    issues: issues || [],
    summary,
  });
});

export default agents;
