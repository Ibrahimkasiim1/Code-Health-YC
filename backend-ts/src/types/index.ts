import { z } from "zod";

// Auth schemas
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const githubCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

// Repository schemas
export const connectRepoSchema = z.object({
  repo_full_name: z.string(),
  default_branch: z.string().default("main"),
});

// Agent schemas
export const analyzeSchema = z.object({
  repo_id: z.string().uuid(),
  total_users: z.number().int().positive().optional().default(100),
  total_requests: z.number().int().positive().optional().default(10000),
});

export const generateFixSchema = z.object({
  issue_id: z.string().uuid(),
});

// Issue schemas
export const updateIssueStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "dismissed"]),
});

// Response types
export interface AuthResponse {
  access_token: string;
  token_type: "bearer";
  user: {
    id: string;
    email: string;
  };
}

export interface UserResponse {
  id: string;
  email: string;
  created_at: string;
}

export interface GitHubAuthUrlResponse {
  authorization_url: string;
  auth_url?: string;
  state: string;
}

export interface GitHubStatusResponse {
  connected: boolean;
  installation?: {
    id: string;
    installation_id?: number | null;
    created_at: string;
  };
}

export interface RepositoryResponse {
  id: string;
  repo_full_name: string;
  default_branch: string;
  created_at: string;
}

export interface AvailableRepository {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string;
}

export interface IssueResponse {
  id: string;
  repo_id: string;
  agent_type: string;
  issue_type: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  metrics?: Record<string, unknown>;
  file_path?: string;
  created_at: string;
  repo_full_name?: string;
}

export interface FixResponse {
  id: string;
  issue_id: string;
  original_code: string;
  fixed_code: string;
  diff: string;
  confidence_score: number;
  explanation: string;
  created_at: string;
}

export interface PRResponse {
  id: string;
  pr_number: number;
  pr_url: string;
  status: string;
}

export interface AnalyzeResponse {
  success: boolean;
  context?: {
    languages: string[];
    frameworks: string[];
    databases: string[];
    apis: string[];
    infrastructure: string[];
    stack_summary: string;
  };
  issues_found: number;
  issues: Array<{
    id: string;
    title: string;
    severity: string;
  }>;
}

export interface GenerateFixResponse {
  success: boolean;
  fix?: FixResponse;
  cached: boolean;
}

// Tech stack context
export interface TechStackContext {
  languages: string[];
  frameworks: string[];
  databases: string[];
  apis: string[];
  infrastructure: string[];
  stack_summary: string;
}

// Spending data
export interface SpendingSummary {
  total_spending: number;
  by_service: Record<string, { amount: number; count: number }>;
  transaction_count: number;
  period_days: number;
}

export interface UnitEconomics {
  service: string;
  monthly_spending: number;
  cost_per_user: number;
  cost_per_request: number;
  benchmark_cost_per_user: number;
  efficiency_ratio: number;
}

// LLM Analysis types
export interface CostAnalysisResult {
  root_cause: "missing_cache" | "no_batching" | "redundant_calls" | "inefficient_prompts" | "other";
  explanation: string;
  suggested_fix: string;
  confidence: number;
}

// Industry benchmarks
export const INDUSTRY_BENCHMARKS: Record<string, { cost_per_user: number; cost_per_1k_requests: number }> = {
  openai: { cost_per_user: 5.0, cost_per_1k_requests: 0.5 },
  anthropic: { cost_per_user: 4.0, cost_per_1k_requests: 0.4 },
  gemini: { cost_per_user: 3.0, cost_per_1k_requests: 0.25 },
  default: { cost_per_user: 3.0, cost_per_1k_requests: 0.3 },
};
