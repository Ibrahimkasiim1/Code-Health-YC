import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "./config.js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const config = getConfig();
  supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

  return supabaseClient;
}

// Database schema types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface GitHubInstallation {
  id: string;
  user_id: string;
  installation_id?: number | null;
  access_token_encrypted: string;
  refresh_token_encrypted?: string | null;
  token_expires_at?: string;
  created_at: string;
}

export interface ConnectedRepository {
  id: string;
  installation_id: string;
  repo_full_name: string;
  default_branch: string;
  created_at: string;
}

export interface RepositoryContext {
  id: string;
  repo_id: string;
  context_json: Record<string, unknown> | null;
  stack_summary: string;
  analyzed_at: string;
}

export interface BrexTransaction {
  id: string;
  user_id: string;
  amount: number;
  merchant: string;
  detected_service?: string | null;
  transaction_date: string;
  created_at: string;
}

export interface Issue {
  id: string;
  repo_id: string;
  agent_type?: string;
  issue_type: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "dismissed";
  metrics?: Record<string, unknown>;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  code_snippet?: string;
  root_cause?: string;
  impact?: string;
  suggested_fix?: string;
  confidence?: number;
  agent?: string;
  created_at: string;
}

export interface Fix {
  id: string;
  issue_id: string;
  original_code: string;
  fixed_code: string;
  diff?: string;
  confidence_score?: number;
  explanation: string;
  file_path?: string;
  start_line?: number;
  end_line?: number;
  pr_title?: string;
  pr_body?: string;
  created_at: string;
}

export interface TelemetryEvent {
  id: string;
  endpoint?: string;
  event_type?: string;
  duration_ms?: number;
  user_id?: string;
  request_hash?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  page_url?: string;
  duration_ms?: number;
  timestamp: string;
}

export interface ErrorEvent {
  id: string;
  error_message?: string;
  stack_trace?: string;
  endpoint?: string;
  user_id?: string;
  timestamp: string;
}

export interface PullRequest {
  id: string;
  fix_id: string;
  repo_id: string;
  pr_number: number;
  pr_url: string;
  status: "open" | "merged" | "closed";
  created_at: string;
}
