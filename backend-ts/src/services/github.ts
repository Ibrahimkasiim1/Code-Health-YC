import { Octokit } from "octokit";
import { getGitHubOAuthConfig } from "../config.js";
import { getSupabase } from "../db.js";

// Get GitHub token for a user
export async function getUserGitHubToken(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("github_installations")
    .select("access_token_encrypted")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.access_token_encrypted;
}

// Get GitHub auth URL for OAuth flow
export function getGitHubAuthUrl(state: string): string {
  const { clientId, redirectUri } = getGitHubOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// Exchange code for access token
export async function exchangeCodeForToken(
  code: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number } | null> {
  const { clientId, clientSecret } = getGitHubOAuthConfig();

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  if (data.error) return null;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

// Get GitHub user info
export async function getGitHubUser(
  accessToken: string
): Promise<{ login: string; id: number; avatar_url: string } | null> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    return {
      login: data.login,
      id: data.id,
      avatar_url: data.avatar_url,
    };
  } catch {
    return null;
  }
}

export async function saveGitHubInstallation(params: {
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  installationId?: number | null;
}): Promise<{ id: string } | null> {
  const supabase = getSupabase();

  const { userId, accessToken, refreshToken, installationId } = params;

  const { data: existing } = await supabase
    .from("github_installations")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const payload = {
    user_id: userId,
    access_token_encrypted: accessToken,
    refresh_token_encrypted: refreshToken ?? null,
    installation_id: installationId ?? null,
  };

  if (existing?.id) {
    console.log(`Updating existing GitHub installation for user ${userId}`);
    const { data, error } = await supabase
      .from("github_installations")
      .update(payload)
      .eq("user_id", userId)
      .select("id")
      .single();

    if (error) {
      console.error("Error updating GitHub installation:", error);
      return null;
    }
    if (!data) {
      console.error("No data returned after updating GitHub installation");
      return null;
    }
    return { id: data.id };
  }

  console.log(`Creating new GitHub installation for user ${userId}`);
  const { data, error } = await supabase
    .from("github_installations")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("Error inserting GitHub installation:", error);
    return null;
  }
  if (!data) {
    console.error("No data returned after inserting GitHub installation");
    return null;
  }
  return { id: data.id };
}

// List user repositories
export async function listUserRepos(accessToken: string): Promise<
  Array<{
    full_name: string;
    name: string;
    owner: string;
    private: boolean;
    default_branch: string;
    description: string | null;
    updated_at: string;
  }>
> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "updated",
      direction: "desc",
    });

    return data.map((repo) => ({
      full_name: repo.full_name,
      name: repo.name,
      owner: repo.owner.login,
      private: repo.private,
      default_branch: repo.default_branch,
      description: repo.description,
      updated_at: repo.updated_at || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// Get file content from repository
export async function getFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string | null> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ("content" in data && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }

    return null;
  } catch {
    return null;
  }
}

// Get repository contents (file metadata)
export async function getRepoContents(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ sha: string; size: number; name: string } | null> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (!Array.isArray(data) && "sha" in data) {
      return {
        sha: data.sha,
        size: data.size,
        name: data.name,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// Get default branch SHA
export async function getDefaultBranchSha(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string | null> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch,
    });
    return data.commit.sha;
  } catch {
    return null;
  }
}

// Create a new branch
export async function createBranch(
  accessToken: string,
  owner: string,
  repo: string,
  branchName: string,
  baseSha: string
): Promise<boolean> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
    return true;
  } catch {
    return false;
  }
}

// Update/create file in repository
export async function updateFile(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<{ sha: string } | null> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
      branch,
      sha,
    });

    return { sha: data.commit.sha };
  } catch {
    return null;
  }
}

// Create pull request
export async function createPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string
): Promise<{ number: number; html_url: string } | null> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });

    return {
      number: data.number,
      html_url: data.html_url,
    };
  } catch {
    return null;
  }
}

// Search code in repository
export async function searchCode(
  accessToken: string,
  owner: string,
  repo: string,
  query: string
): Promise<Array<{ path: string; sha: string }>> {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.search.code({
      q: `${query} repo:${owner}/${repo}`,
      per_page: 10,
    });

    return data.items.map((item) => ({
      path: item.path,
      sha: item.sha,
    }));
  } catch {
    return [];
  }
}

// Create PR from fix (high-level function)
export async function createPRFromFix(params: {
  userId: string;
  owner: string;
  repo: string;
  filePath: string;
  fixedCode: string;
  issueTitle: string;
  issueDescription: string;
  fixExplanation: string;
  defaultBranch: string;
}): Promise<{ number: number; html_url: string } | null> {
  const {
    userId,
    owner,
    repo,
    filePath,
    fixedCode,
    issueTitle,
    issueDescription,
    fixExplanation,
    defaultBranch,
  } = params;
  const accessToken = await getUserGitHubToken(userId);
  if (!accessToken) return null;

  // Get base branch SHA
  const baseSha = await getDefaultBranchSha(accessToken, owner, repo, defaultBranch);
  if (!baseSha) return null;

  // Create new branch
  const branchName = `codehealth/fix-${Date.now()}`;
  const branchCreated = await createBranch(accessToken, owner, repo, branchName, baseSha);
  if (!branchCreated) return null;

  // Get current file SHA
  const fileInfo = await getRepoContents(accessToken, owner, repo, filePath, defaultBranch);

  // Commit the fix
  const commitResult = await updateFile(
    accessToken,
    owner,
    repo,
    filePath,
    fixedCode,
    `fix: ${issueTitle}\n\nGenerated by Code Health Platform`,
    branchName,
    fileInfo?.sha
  );
  if (!commitResult) return null;

  // Create PR
  const body = `## Issue

${issueDescription}

## Fix

${fixExplanation}

---
*This PR was automatically generated by Code Health Platform*`;

  const pr = await createPullRequest(
    accessToken,
    owner,
    repo,
    `fix: ${issueTitle}`,
    body,
    branchName,
    defaultBranch
  );

  return pr;
}
