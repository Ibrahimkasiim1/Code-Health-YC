import { Hono } from "hono";
import { getSupabase } from "../db.js";
import { authMiddleware, getCurrentUser } from "../middleware/auth.js";
import { createPRFromFix } from "../services/github.js";

const issues = new Hono();

issues.use("*", authMiddleware);

issues.get("/", async (c) => {
  const user = getCurrentUser(c);
  const statusFilter = c.req.query("status_filter") || undefined;
  const showAll = c.req.query("all") === "true"; // Add ?all=true to see all issues
  const supabase = getSupabase();

  console.log(`[Issues] Fetching issues for user: ${user.id}, showAll: ${showAll}`);

  // If showAll is true, return ALL issues in the database (for demo/debug)
  if (showAll) {
    const { data: allRepos } = await supabase
      .from("connected_repositories")
      .select("id, repo_full_name");
    
    const repoMap = new Map((allRepos || []).map((r) => [r.id, r.repo_full_name]));
    
    let query = supabase
      .from("issues")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data: issuesData } = await query;
    console.log(`[Issues] Found ${issuesData?.length || 0} total issues in database`);

    const payload =
      issuesData?.map((issue) => ({
        ...issue,
        repo_full_name: repoMap.get(issue.repo_id) ?? "unknown",
      })) ?? [];

    return c.json({ issues: payload });
  }

  const { data: installations } = await supabase
    .from("github_installations")
    .select("id")
    .eq("user_id", user.id);

  console.log(`[Issues] User installations: ${installations?.length || 0}`);

  if (!installations || installations.length === 0) {
    return c.json({ issues: [] });
  }

  const installationIds = installations.map((inst) => inst.id);
  const { data: repos } = await supabase
    .from("connected_repositories")
    .select("id, repo_full_name")
    .in("installation_id", installationIds);

  console.log(`[Issues] Connected repos for user: ${repos?.length || 0}`, repos?.map(r => r.repo_full_name));

  if (!repos || repos.length === 0) {
    return c.json({ issues: [] });
  }

  const repoIds = repos.map((r) => r.id);
  const repoMap = new Map(repos.map((r) => [r.id, r.repo_full_name]));

  let query = supabase
    .from("issues")
    .select("*")
    .in("repo_id", repoIds)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: issuesData } = await query;
  console.log(`[Issues] Found ${issuesData?.length || 0} issues for user's repos`);

  const payload =
    issuesData?.map((issue) => ({
      ...issue,
      repo_full_name: repoMap.get(issue.repo_id) ?? null,
    })) ?? [];

  return c.json({ issues: payload });
});

issues.get("/:issueId", async (c) => {
  const issueId = c.req.param("issueId");
  const supabase = getSupabase();

  console.log(`[Issues] Fetching issue: ${issueId}`);

  // Fetch issue with repo info (without user filtering for demo)
  const { data: issue, error } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .single();

  if (error || !issue) {
    console.error(`[Issues] Issue not found: ${issueId}`, error);
    return c.json({ detail: "Issue not found" }, 404);
  }

  // Get repo name
  let repoFullName = null;
  if (issue.repo_id) {
    const { data: repo } = await supabase
      .from("connected_repositories")
      .select("repo_full_name")
      .eq("id", issue.repo_id)
      .single();
    repoFullName = repo?.repo_full_name || null;
  }

  console.log(`[Issues] Found issue: ${issue.title}`);

  return c.json({
    issue: {
      ...issue,
      repo_full_name: repoFullName,
    },
  });
});

issues.get("/:issueId/fix", async (c) => {
  const issueId = c.req.param("issueId");
  const supabase = getSupabase();

  // Check if issue exists
  const { data: issue, error } = await supabase
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .single();

  if (error || !issue) {
    return c.json({ detail: "Issue not found" }, 404);
  }

  const { data: fix } = await supabase
    .from("fixes")
    .select("*")
    .eq("issue_id", issueId)
    .single();

  if (!fix) {
    return c.json({ detail: "No fix generated for this issue" }, 404);
  }

  const { data: pr } = await supabase
    .from("pull_requests")
    .select("*")
    .eq("fix_id", fix.id)
    .maybeSingle();

  return c.json({ fix, pull_request: pr ?? null });
});

issues.post("/:issueId/create-pr", async (c) => {
  const user = getCurrentUser(c);
  const issueId = c.req.param("issueId");
  const supabase = getSupabase();

  const { data: issue, error } = await supabase
    .from("issues")
    .select("*, connected_repositories!inner(repo_full_name, default_branch, github_installations!inner(user_id))")
    .eq("id", issueId)
    .single();

  if (error || !issue) {
    return c.json({ detail: "Issue not found" }, 404);
  }

  if (issue.connected_repositories.github_installations.user_id !== user.id) {
    return c.json({ detail: "Access denied" }, 403);
  }

  const { data: fix } = await supabase
    .from("fixes")
    .select("*")
    .eq("issue_id", issueId)
    .single();

  if (!fix) {
    return c.json({ detail: "No fix available for this issue" }, 404);
  }

  if (!issue.file_path) {
    return c.json({ detail: "Issue missing file path" }, 400);
  }

  const { data: existingPr } = await supabase
    .from("pull_requests")
    .select("*")
    .eq("fix_id", fix.id)
    .maybeSingle();

  if (existingPr) {
    return c.json({ pull_request: existingPr });
  }

  const [owner, repoName] = issue.connected_repositories.repo_full_name.split("/");
  const prResult = await createPRFromFix({
    userId: user.id,
    owner,
    repo: repoName,
    filePath: issue.file_path,
    fixedCode: fix.fixed_code,
    issueTitle: issue.title,
    issueDescription: issue.description ?? "",
    fixExplanation: fix.explanation ?? "",
    defaultBranch: issue.connected_repositories.default_branch || "main",
  });

  if (!prResult) {
    return c.json({ detail: "Failed to create pull request" }, 500);
  }

  const { data: prData } = await supabase
    .from("pull_requests")
    .insert({
      fix_id: fix.id,
      repo_id: issue.repo_id,
      pr_number: prResult.number,
      pr_url: prResult.html_url,
      status: "open",
    })
    .select()
    .single();

  await supabase
    .from("issues")
    .update({ status: "in_progress" })
    .eq("id", issueId);

  return c.json({ pull_request: prData ?? null });
});

issues.patch("/:issueId/status", async (c) => {
  const user = getCurrentUser(c);
  const issueId = c.req.param("issueId");
  const newStatus = c.req.query("new_status");

  if (!newStatus || !["open", "in_progress", "resolved", "dismissed"].includes(newStatus)) {
    return c.json({ detail: "Invalid status" }, 400);
  }

  const supabase = getSupabase();

  const { data: issue, error } = await supabase
    .from("issues")
    .select("*, connected_repositories!inner(github_installations!inner(user_id))")
    .eq("id", issueId)
    .single();

  if (error || !issue) {
    return c.json({ detail: "Issue not found" }, 404);
  }

  if (issue.connected_repositories.github_installations.user_id !== user.id) {
    return c.json({ detail: "Access denied" }, 403);
  }

  await supabase.from("issues").update({ status: newStatus }).eq("id", issueId);

  return c.json({ success: true, status: newStatus });
});

export default issues;
