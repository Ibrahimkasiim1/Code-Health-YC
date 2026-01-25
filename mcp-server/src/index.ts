import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Octokit } from "octokit";

// Configuration - can be set via env vars or dynamically via connect tool
let supabaseUrl = process.env.SUPABASE_URL || "";
let supabaseKey = process.env.SUPABASE_SERVICE_KEY || "";
const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
let currentUserId = process.env.USER_ID || "";

let supabase: SupabaseClient | null = null;
let isConfigured = !!(supabaseUrl && supabaseKey);

function getSupabase(): SupabaseClient {
  if (!supabase && supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  if (!supabase) {
    throw new Error("Supabase not configured. Use the 'connect' tool first.");
  }
  return supabase;
}

function resetSupabase() {
  supabase = null;
}

// Get the current user ID (either from env or from connect tool)
function getCurrentUserId(): string {
  if (!currentUserId) {
    throw new Error("User not configured. Use the 'connect' tool first.");
  }
  return currentUserId;
}

// Industry benchmarks for cost comparison
const INDUSTRY_BENCHMARKS: Record<string, { costPerUser: number; costPer1kRequests: number }> = {
  openai: { costPerUser: 5.0, costPer1kRequests: 0.5 },
  anthropic: { costPerUser: 4.0, costPer1kRequests: 0.4 },
  stripe: { costPerUser: 2.0, costPer1kRequests: 0.1 },
  twilio: { costPerUser: 1.0, costPer1kRequests: 0.05 },
  default: { costPerUser: 3.0, costPer1kRequests: 0.3 },
};

// Tool definitions
const TOOLS = [
  // ============ CONNECTION TOOLS ============
  {
    name: "connect",
    description: "Connect to a Code Health instance using Supabase credentials. Run this first before using other tools.",
    inputSchema: {
      type: "object",
      properties: {
        supabase_url: {
          type: "string",
          description: "The Supabase project URL (e.g., https://xxx.supabase.co)",
        },
        supabase_key: {
          type: "string",
          description: "The Supabase service role key",
        },
        user_id: {
          type: "string",
          description: "The user ID for the Code Health platform",
        },
      },
      required: ["supabase_url", "supabase_key", "user_id"],
    },
  },
  {
    name: "get_connection_status",
    description: "Check if the MCP server is connected and configured",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "disconnect",
    description: "Disconnect from the current Code Health instance",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  // ============ SPENDING ANALYSIS TOOLS ============
  {
    name: "get_spending_summary",
    description: "Get a summary of spending by service for a user over a specified time period",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The user ID to get spending for",
        },
        days: {
          type: "number",
          description: "Number of days to look back (default: 30)",
          default: 30,
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "calculate_unit_economics",
    description: "Calculate unit economics (cost per user, cost per request) for a service",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The user ID",
        },
        service: {
          type: "string",
          description: "The service name (e.g., 'openai', 'anthropic')",
        },
        total_users: {
          type: "number",
          description: "Total number of users",
        },
        total_requests: {
          type: "number",
          description: "Total number of API requests",
        },
      },
      required: ["user_id", "service", "total_users", "total_requests"],
    },
  },

  // ============ REPOSITORY TOOLS ============
  {
    name: "list_connected_repositories",
    description: "List all repositories connected to the Code Health platform for a user",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The user ID to list repositories for",
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "get_repository_context",
    description: "Get the analyzed context (tech stack, architecture) for a repository",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: {
          type: "string",
          description: "The repository ID",
        },
      },
      required: ["repo_id"],
    },
  },
  {
    name: "analyze_repository",
    description: "Run AI-powered analysis on a connected repository to find security, performance, and cost issues. This triggers multiple specialized agents to scan the codebase.",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: {
          type: "string",
          description: "The repository ID to analyze",
        },
        auth_token: {
          type: "string",
          description: "JWT auth token for the backend API",
        },
      },
      required: ["repo_id", "auth_token"],
    },
  },

  // ============ ISSUE TOOLS ============
  {
    name: "list_issues",
    description: "List all detected issues for a user's repositories with optional status filter",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The user ID to list issues for",
        },
        status: {
          type: "string",
          enum: ["open", "in_progress", "resolved", "dismissed"],
          description: "Optional status filter",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Optional severity filter",
        },
        repo_id: {
          type: "string",
          description: "Optional repository ID to filter by",
        },
        limit: {
          type: "number",
          description: "Maximum number of issues to return (default: 50)",
          default: 50,
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "get_issue",
    description: "Get detailed information about a specific issue including code snippet and suggested fix",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: {
          type: "string",
          description: "The issue ID to get details for",
        },
      },
      required: ["issue_id"],
    },
  },
  {
    name: "update_issue_status",
    description: "Update the status of an issue (open, in_progress, resolved, dismissed)",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: {
          type: "string",
          description: "The issue ID to update",
        },
        status: {
          type: "string",
          enum: ["open", "in_progress", "resolved", "dismissed"],
          description: "The new status",
        },
      },
      required: ["issue_id", "status"],
    },
  },

  // ============ FIX & PR TOOLS ============
  {
    name: "generate_fix",
    description: "Generate an AI-powered code fix for a specific issue. Returns the fixed code and explanation.",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: {
          type: "string",
          description: "The issue ID to generate a fix for",
        },
        auth_token: {
          type: "string",
          description: "JWT auth token for the backend API",
        },
      },
      required: ["issue_id", "auth_token"],
    },
  },
  {
    name: "get_fix",
    description: "Get the generated fix for an issue if one exists",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: {
          type: "string",
          description: "The issue ID to get the fix for",
        },
      },
      required: ["issue_id"],
    },
  },
  {
    name: "create_pull_request",
    description: "Create a GitHub pull request from a generated fix. The fix must already exist for the issue.",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: {
          type: "string",
          description: "The issue ID to create a PR for",
        },
        auth_token: {
          type: "string",
          description: "JWT auth token for the backend API",
        },
      },
      required: ["issue_id", "auth_token"],
    },
  },

  // ============ GITHUB TOOLS ============
  {
    name: "list_available_repositories",
    description: "List all GitHub repositories available to connect (from user's GitHub account)",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The user ID",
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "get_file_content",
    description: "Get the content of a file from a connected repository",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: {
          type: "string",
          description: "The repository ID",
        },
        file_path: {
          type: "string",
          description: "Path to the file in the repository",
        },
      },
      required: ["repo_id", "file_path"],
    },
  },
];

// ============ TOOL IMPLEMENTATIONS ============

// Spending Analysis
async function getSpendingSummary(
  userId: string,
  days: number = 30
): Promise<{
  totalSpending: number;
  byService: Record<string, { amount: number; count: number }>;
  transactionCount: number;
  periodDays: number;
}> {
  const db = getSupabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data: transactions, error } = await db
    .from("brex_transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("transaction_date", cutoffDate.toISOString().split("T")[0]);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  const byService: Record<string, { amount: number; count: number }> = {};
  let totalSpending = 0;

  for (const tx of transactions || []) {
    const service = tx.detected_service || tx.merchant;
    const amount = parseFloat(tx.amount);
    totalSpending += amount;

    if (!byService[service]) {
      byService[service] = { amount: 0, count: 0 };
    }
    byService[service].amount += amount;
    byService[service].count += 1;
  }

  return {
    totalSpending,
    byService,
    transactionCount: transactions?.length || 0,
    periodDays: days,
  };
}

async function calculateUnitEconomics(
  userId: string,
  service: string,
  totalUsers: number,
  totalRequests: number
): Promise<{
  service: string;
  monthlySpending: number;
  costPerUser: number;
  costPerRequest: number;
  costPer1kRequests: number;
  benchmarkCostPerUser: number;
  benchmarkCostPer1kRequests: number;
  efficiencyRatio: number;
}> {
  const spending = await getSpendingSummary(userId, 30);
  const serviceSpending = spending.byService[service]?.amount || 0;

  const costPerUser = totalUsers > 0 ? serviceSpending / totalUsers : 0;
  const costPerRequest = totalRequests > 0 ? serviceSpending / totalRequests : 0;
  const costPer1kRequests = costPerRequest * 1000;

  const benchmark =
    INDUSTRY_BENCHMARKS[service.toLowerCase()] || INDUSTRY_BENCHMARKS.default;

  const efficiencyRatio =
    costPerUser > 0 ? benchmark.costPerUser / costPerUser : 0;

  return {
    service,
    monthlySpending: serviceSpending,
    costPerUser,
    costPerRequest,
    costPer1kRequests,
    benchmarkCostPerUser: benchmark.costPerUser,
    benchmarkCostPer1kRequests: benchmark.costPer1kRequests,
    efficiencyRatio,
  };
}

// Repository Functions
async function listConnectedRepositories(userId: string): Promise<{
  repositories: Array<{
    id: string;
    repo_full_name: string;
    default_branch: string;
    created_at: string;
    has_context: boolean;
    issue_count: number;
  }>;
}> {
  const db = getSupabase();

  // Get user's GitHub installations
  const { data: installations } = await db
    .from("github_installations")
    .select("id")
    .eq("user_id", userId);

  if (!installations || installations.length === 0) {
    return { repositories: [] };
  }

  const installationIds = installations.map((i: { id: string }) => i.id);

  // Get connected repos
  const { data: repos, error } = await db
    .from("connected_repositories")
    .select("id, repo_full_name, default_branch, created_at")
    .in("installation_id", installationIds);

  if (error) {
    throw new Error(`Failed to fetch repositories: ${error.message}`);
  }

  // Enrich with context and issue count
  const enrichedRepos = await Promise.all(
    (repos || []).map(async (repo: { id: string; repo_full_name: string; default_branch: string; created_at: string }) => {
      const { data: context } = await db
        .from("repository_contexts")
        .select("id")
        .eq("repo_id", repo.id)
        .maybeSingle();

      const { count } = await db
        .from("issues")
        .select("*", { count: "exact", head: true })
        .eq("repo_id", repo.id);

      return {
        ...repo,
        has_context: !!context,
        issue_count: count || 0,
      };
    })
  );

  return { repositories: enrichedRepos };
}

async function getRepositoryContext(repoId: string): Promise<{
  context: Record<string, unknown> | null;
  stackSummary: string | null;
  analyzedAt: string | null;
}> {
  const db = getSupabase();

  const { data, error } = await db
    .from("repository_contexts")
    .select("context_json, stack_summary, analyzed_at")
    .eq("repo_id", repoId)
    .single();

  if (error) {
    return { context: null, stackSummary: null, analyzedAt: null };
  }

  return {
    context: data?.context_json || null,
    stackSummary: data?.stack_summary || null,
    analyzedAt: data?.analyzed_at || null,
  };
}

async function analyzeRepository(
  repoId: string,
  authToken: string
): Promise<{
  success: boolean;
  issuesFound: number;
  summary: Record<string, unknown>;
  executionTimeMs: number;
  error?: string;
}> {
  try {
    const response = await fetch(`${backendUrl}/agents/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ repo_id: repoId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      issuesFound: data.issues_found,
      summary: data.summary,
      executionTimeMs: data.execution_time_ms,
    };
  } catch (error) {
    return {
      success: false,
      issuesFound: 0,
      summary: {},
      executionTimeMs: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Issue Functions
async function listIssues(params: {
  userId: string;
  status?: string;
  severity?: string;
  repoId?: string;
  limit?: number;
}): Promise<{
  issues: Array<{
    id: string;
    repo_id: string;
    repo_full_name: string;
    issue_type: string;
    severity: string;
    status: string;
    title: string;
    description: string;
    file_path: string | null;
    agent: string;
    created_at: string;
  }>;
  total: number;
}> {
  const db = getSupabase();
  const { userId, status, severity, repoId, limit = 50 } = params;

  // Get user's installations
  const { data: installations } = await db
    .from("github_installations")
    .select("id")
    .eq("user_id", userId);

  if (!installations || installations.length === 0) {
    return { issues: [], total: 0 };
  }

  const installationIds = installations.map((i: { id: string }) => i.id);

  // Get user's repos
  const { data: repos } = await db
    .from("connected_repositories")
    .select("id, repo_full_name")
    .in("installation_id", installationIds);

  if (!repos || repos.length === 0) {
    return { issues: [], total: 0 };
  }

  const repoIds = repoId ? [repoId] : repos.map((r: { id: string }) => r.id);
  const repoMap = new Map(repos.map((r: { id: string; repo_full_name: string }) => [r.id, r.repo_full_name]));

  // Build query
  let query = db
    .from("issues")
    .select("*")
    .in("repo_id", repoIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }
  if (severity) {
    query = query.eq("severity", severity);
  }

  const { data: issues, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch issues: ${error.message}`);
  }

  const enrichedIssues = (issues || []).map((issue: any) => ({
    id: issue.id as string,
    repo_id: issue.repo_id as string,
    repo_full_name: repoMap.get(issue.repo_id as string) || "Unknown",
    issue_type: issue.issue_type as string,
    severity: issue.severity as string,
    status: issue.status as string,
    title: issue.title as string,
    description: issue.description as string,
    file_path: issue.file_path as string | null,
    agent: issue.agent as string,
    created_at: issue.created_at as string,
  }));

  return { issues: enrichedIssues, total: enrichedIssues.length };
}

async function getIssue(issueId: string): Promise<{
  issue: {
    id: string;
    repo_id: string;
    issue_type: string;
    severity: string;
    status: string;
    title: string;
    description: string;
    file_path: string | null;
    line_start: number | null;
    line_end: number | null;
    code_snippet: string | null;
    root_cause: string | null;
    impact: string | null;
    suggested_fix: string | null;
    confidence: number | null;
    agent: string;
    created_at: string;
  } | null;
  fix: {
    id: string;
    original_code: string;
    fixed_code: string;
    explanation: string;
    pr_title: string | null;
  } | null;
  pullRequest: {
    pr_number: number;
    pr_url: string;
    status: string;
  } | null;
}> {
  const db = getSupabase();

  const { data: issue, error } = await db
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .single();

  if (error || !issue) {
    return { issue: null, fix: null, pullRequest: null };
  }

  // Get fix if exists
  const { data: fix } = await db
    .from("fixes")
    .select("id, original_code, fixed_code, explanation, pr_title")
    .eq("issue_id", issueId)
    .maybeSingle();

  // Get PR if exists
  let pullRequest = null;
  if (fix) {
    const { data: pr } = await db
      .from("pull_requests")
      .select("pr_number, pr_url, status")
      .eq("fix_id", fix.id)
      .maybeSingle();
    pullRequest = pr;
  }

  return { issue, fix, pullRequest };
}

async function updateIssueStatus(
  issueId: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  const db = getSupabase();

  const { error } = await db
    .from("issues")
    .update({ status })
    .eq("id", issueId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Fix & PR Functions
async function generateFix(
  issueId: string,
  authToken: string
): Promise<{
  success: boolean;
  fix?: {
    file_path: string;
    original_code: string;
    fixed_code: string;
    explanation: string;
    pr_title: string;
  };
  cached: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(`${backendUrl}/agents/generate-fix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ issue_id: issueId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      fix: {
        file_path: data.fix.file_path,
        original_code: data.fix.original_code,
        fixed_code: data.fix.fixed_code,
        explanation: data.fix.explanation,
        pr_title: data.fix.pr_title,
      },
      cached: data.cached || false,
    };
  } catch (error) {
    return {
      success: false,
      cached: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function getFix(issueId: string): Promise<{
  fix: {
    id: string;
    file_path: string;
    original_code: string;
    fixed_code: string;
    explanation: string;
    pr_title: string | null;
    pr_body: string | null;
  } | null;
}> {
  const db = getSupabase();

  const { data: fix } = await db
    .from("fixes")
    .select("*")
    .eq("issue_id", issueId)
    .maybeSingle();

  return { fix };
}

async function createPullRequest(
  issueId: string,
  authToken: string
): Promise<{
  success: boolean;
  pullRequest?: {
    pr_number: number;
    pr_url: string;
  };
  error?: string;
}> {
  try {
    const response = await fetch(`${backendUrl}/issues/${issueId}/create-pr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      pullRequest: {
        pr_number: data.pull_request.pr_number,
        pr_url: data.pull_request.pr_url,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// GitHub Functions
async function listAvailableRepositories(userId: string): Promise<{
  repositories: Array<{
    full_name: string;
    name: string;
    owner: string;
    private: boolean;
    default_branch: string;
    description: string | null;
  }>;
}> {
  const db = getSupabase();

  // Get user's GitHub token
  const { data: installation } = await db
    .from("github_installations")
    .select("access_token_encrypted")
    .eq("user_id", userId)
    .single();

  if (!installation?.access_token_encrypted) {
    return { repositories: [] };
  }

  const octokit = new Octokit({ auth: installation.access_token_encrypted });

  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "updated",
      direction: "desc",
    });

    return {
      repositories: data.map((repo: any) => ({
        full_name: repo.full_name,
        name: repo.name,
        owner: repo.owner.login,
        private: repo.private,
        default_branch: repo.default_branch,
        description: repo.description,
      })),
    };
  } catch {
    return { repositories: [] };
  }
}

async function getFileContent(
  repoId: string,
  filePath: string
): Promise<{ content: string | null; error?: string }> {
  const db = getSupabase();

  // Get repo details with GitHub token
  const { data: repo } = await db
    .from("connected_repositories")
    .select("repo_full_name, github_installations!inner(access_token_encrypted)")
    .eq("id", repoId)
    .single();

  if (!repo) {
    return { content: null, error: "Repository not found" };
  }

  const accessToken = (repo as any).github_installations.access_token_encrypted;
  const [owner, repoName] = repo.repo_full_name.split("/");

  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo: repoName,
      path: filePath,
    });

    if ("content" in data && data.encoding === "base64") {
      return { content: Buffer.from(data.content, "base64").toString("utf-8") };
    }

    return { content: null, error: "File content not available" };
  } catch (error) {
    return {
      content: null,
      error: error instanceof Error ? error.message : "Failed to fetch file",
    };
  }
}

// ============ SERVER SETUP ============

async function main() {
  const server = new Server(
    {
      name: "code-health-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        // Connection Tools
        case "connect": {
          const newUrl = args?.supabase_url as string;
          const newKey = args?.supabase_key as string;
          const userId = args?.user_id as string;

          // Validate credentials by trying to connect
          try {
            const testClient = createClient(newUrl, newKey);
            // Try a simple query
            await testClient.from("users").select("id").limit(1);
          } catch (err) {
            return {
              content: [{ type: "text", text: JSON.stringify({ 
                success: false, 
                error: "Failed to connect. Please check your credentials." 
              }, null, 2) }],
              isError: true,
            };
          }

          // Update the configuration
          supabaseUrl = newUrl;
          supabaseKey = newKey;
          currentUserId = userId;
          resetSupabase();
          isConfigured = true;

          return {
            content: [{ type: "text", text: JSON.stringify({ 
              success: true, 
              message: "Connected successfully!",
              user_id: userId,
              supabase_url: newUrl,
            }, null, 2) }],
          };
        }

        case "get_connection_status": {
          return {
            content: [{ type: "text", text: JSON.stringify({ 
              configured: isConfigured,
              user_id: currentUserId || null,
              supabase_url: supabaseUrl || null,
              backend_url: backendUrl,
            }, null, 2) }],
          };
        }

        case "disconnect": {
          supabaseUrl = "";
          supabaseKey = "";
          currentUserId = "";
          resetSupabase();
          isConfigured = false;

          return {
            content: [{ type: "text", text: JSON.stringify({ 
              success: true, 
              message: "Disconnected successfully" 
            }, null, 2) }],
          };
        }

        // Spending Tools
        case "get_spending_summary": {
          const result = await getSpendingSummary(
            args?.user_id as string,
            (args?.days as number) || 30
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "calculate_unit_economics": {
          const result = await calculateUnitEconomics(
            args?.user_id as string,
            args?.service as string,
            args?.total_users as number,
            args?.total_requests as number
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        // Repository Tools
        case "list_connected_repositories": {
          const result = await listConnectedRepositories(args?.user_id as string);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "get_repository_context": {
          const result = await getRepositoryContext(args?.repo_id as string);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "analyze_repository": {
          const result = await analyzeRepository(
            args?.repo_id as string,
            args?.auth_token as string
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        // Issue Tools
        case "list_issues": {
          const result = await listIssues({
            userId: args?.user_id as string,
            status: args?.status as string | undefined,
            severity: args?.severity as string | undefined,
            repoId: args?.repo_id as string | undefined,
            limit: args?.limit as number | undefined,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "get_issue": {
          const result = await getIssue(args?.issue_id as string);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "update_issue_status": {
          const result = await updateIssueStatus(
            args?.issue_id as string,
            args?.status as string
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        // Fix & PR Tools
        case "generate_fix": {
          const result = await generateFix(
            args?.issue_id as string,
            args?.auth_token as string
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "get_fix": {
          const result = await getFix(args?.issue_id as string);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "create_pull_request": {
          const result = await createPullRequest(
            args?.issue_id as string,
            args?.auth_token as string
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        // GitHub Tools
        case "list_available_repositories": {
          const result = await listAvailableRepositories(args?.user_id as string);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "get_file_content": {
          const result = await getFileContent(
            args?.repo_id as string,
            args?.file_path as string
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Code Health MCP Server running on stdio");
  console.error(`Backend URL: ${backendUrl}`);
}

main().catch(console.error);
