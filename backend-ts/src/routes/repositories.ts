import { Hono } from "hono";
import { getSupabase } from "../db.js";
import { authMiddleware, getCurrentUser } from "../middleware/auth.js";
import { connectRepoSchema } from "../types/index.js";
import { getUserGitHubToken, listUserRepos, getFileContent } from "../services/github.js";

const repositories = new Hono();

repositories.use("*", authMiddleware);

repositories.get("/available", async (c) => {
  const user = getCurrentUser(c);
  const accessToken = await getUserGitHubToken(user.id);

  if (!accessToken) {
    return c.json(
      { detail: "GitHub not connected. Please connect your GitHub account first." },
      400
    );
  }

  const repos = await listUserRepos(accessToken);
  const payload = repos.map((repo) => ({
    full_name: repo.full_name,
    name: repo.name,
    owner: repo.owner,
    private: repo.private,
    default_branch: repo.default_branch,
    description: repo.description,
    updated_at: repo.updated_at,
  }));

  return c.json({ repositories: payload });
});

repositories.post("/connect", async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);
  const parsed = connectRepoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ detail: "Invalid repository payload" }, 400);
  }

  const { repo_full_name, default_branch } = parsed.data;
  const supabase = getSupabase();

  const { data: installation } = await supabase
    .from("github_installations")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!installation) {
    return c.json({ detail: "GitHub not connected" }, 400);
  }

  const { data: existing } = await supabase
    .from("connected_repositories")
    .select("id")
    .eq("repo_full_name", repo_full_name);

  if (existing && existing.length > 0) {
    return c.json({ detail: "Repository already connected" }, 400);
  }

  const { data: repo, error } = await supabase
    .from("connected_repositories")
    .insert({
      installation_id: installation.id,
      repo_full_name,
      default_branch,
    })
    .select()
    .single();

  if (error || !repo) {
    return c.json({ detail: "Failed to connect repository" }, 500);
  }

  return c.json({ repository: repo });
});

repositories.get("/connected", async (c) => {
  const user = getCurrentUser(c);
  const supabase = getSupabase();

  const { data: installations } = await supabase
    .from("github_installations")
    .select("id")
    .eq("user_id", user.id);

  if (!installations || installations.length === 0) {
    return c.json({ repositories: [] });
  }

  const installationIds = installations.map((inst) => inst.id);
  const { data: repos } = await supabase
    .from("connected_repositories")
    .select("*")
    .in("installation_id", installationIds);

  return c.json({ repositories: repos ?? [] });
});

repositories.delete("/:repoId", async (c) => {
  const user = getCurrentUser(c);
  const repoId = c.req.param("repoId");
  const supabase = getSupabase();

  const { data: installations } = await supabase
    .from("github_installations")
    .select("id")
    .eq("user_id", user.id);

  if (!installations || installations.length === 0) {
    return c.json({ detail: "Repository not found" }, 404);
  }

  const installationIds = installations.map((inst) => inst.id);
  await supabase
    .from("connected_repositories")
    .delete()
    .eq("id", repoId)
    .in("installation_id", installationIds);

  return c.json({ success: true });
});

repositories.get("/:repoId/file", async (c) => {
  const user = getCurrentUser(c);
  const repoId = c.req.param("repoId");
  const path = c.req.query("path");

  if (!path) {
    return c.json({ detail: "Missing path query parameter" }, 400);
  }

  const supabase = getSupabase();
  const { data: repo } = await supabase
    .from("connected_repositories")
    .select("*, github_installations!inner(access_token_encrypted, user_id)")
    .eq("id", repoId)
    .single();

  if (!repo) {
    return c.json({ detail: "Repository not found" }, 404);
  }

  if (repo.github_installations.user_id !== user.id) {
    return c.json({ detail: "Access denied" }, 403);
  }

  const accessToken = repo.github_installations.access_token_encrypted;
  const [owner, repoName] = repo.repo_full_name.split("/");

  const content = await getFileContent(
    accessToken,
    owner,
    repoName,
    path,
    repo.default_branch
  );

  if (!content) {
    return c.json({ detail: "File not found" }, 404);
  }

  return c.json({ path, content });
});

export default repositories;
