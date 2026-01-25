import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getSupabase } from "../../db.js";
import { INDUSTRY_BENCHMARKS } from "../../types/index.js";

/**
 * Get financial/spending data from Brex
 */
export const getBrexSpending = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      let query = supabase
        .from("brex_transactions")
        .select("*")
        .gte("transaction_date", input.start_date)
        .lte("transaction_date", input.end_date);

      if (input.user_id) query = query.eq("user_id", input.user_id);
      if (input.service) query = query.eq("detected_service", input.service);

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      const transactions = (data || []).map((tx) => ({
        service: tx.detected_service || tx.merchant,
        amount: tx.amount,
        date: tx.transaction_date,
        description: tx.merchant,
      }));

      const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);

      return JSON.stringify({
        total_amount: totalAmount,
        currency: "USD",
        transactions,
      });
    } catch (error) {
      return JSON.stringify({ error: `Query failed: ${error}` });
    }
  },
  {
    name: "get_brex_spending",
    description: "Get financial/spending data from Brex. Returns total amount and transaction details.",
    schema: z.object({
      user_id: z.string().optional().describe("Filter by user ID"),
      service: z.string().optional().describe("Filter by service name"),
      start_date: z.string().describe("Start date (ISO format)"),
      end_date: z.string().describe("End date (ISO format)"),
    }),
  }
);

/**
 * Get cached tech stack analysis from Context Agent
 */
export const getRepositoryContext = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from("repository_contexts")
        .select("context_json, stack_summary, analyzed_at")
        .eq("repo_id", input.repo_id)
        .single();

      if (error) return JSON.stringify({ error: error.message });
      if (!data) return JSON.stringify({ error: "No context found for repository" });

      const context = data.context_json as Record<string, unknown> || {};
      return JSON.stringify({
        languages: context.languages || [],
        frameworks: context.frameworks || [],
        databases: context.databases || [],
        apis: context.apis || [],
        infrastructure: context.infrastructure || [],
        entry_points: context.entry_points || [],
        stack_summary: data.stack_summary,
        last_updated: data.analyzed_at,
      });
    } catch (error) {
      return JSON.stringify({ error: `Query failed: ${error}` });
    }
  },
  {
    name: "get_repository_context",
    description: "Get cached tech stack analysis from Context Agent. Use to understand repository structure.",
    schema: z.object({
      repo_id: z.string().describe("Repository ID"),
    }),
  }
);

/**
 * Check if similar issue already exists (deduplication)
 */
export const getExistingIssues = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      let query = supabase
        .from("issues")
        .select("id, issue_type, file_path, severity, status, created_at, title")
        .eq("repo_id", input.repo_id);

      if (input.issue_type) query = query.eq("issue_type", input.issue_type);
      if (input.file_path) query = query.eq("file_path", input.file_path);
      if (input.severity) query = query.eq("severity", input.severity);

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      return JSON.stringify(data || []);
    } catch (error) {
      return JSON.stringify({ error: `Query failed: ${error}` });
    }
  },
  {
    name: "get_existing_issues",
    description: "Check if similar issue already exists. Use for deduplication before creating new issues.",
    schema: z.object({
      repo_id: z.string().describe("Repository ID"),
      issue_type: z.string().optional().describe("Filter by issue type"),
      file_path: z.string().optional().describe("Filter by file path"),
      severity: z.string().optional().describe("Filter by severity"),
    }),
  }
);

/**
 * Calculate unit economics for a service
 */
export const calculateUnitEconomics = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const { data, error } = await supabase
        .from("brex_transactions")
        .select("amount, detected_service")
        .eq("user_id", input.user_id)
        .eq("detected_service", input.service)
        .gte("transaction_date", cutoff.toISOString());

      if (error) return JSON.stringify({ error: error.message });

      const monthlySpending = (data || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const costPerUser = input.total_users > 0 ? monthlySpending / input.total_users : 0;
      const costPerRequest = input.total_requests > 0 ? monthlySpending / input.total_requests : 0;

      const serviceKey = input.service.toLowerCase();
      const benchmark = INDUSTRY_BENCHMARKS[serviceKey] || INDUSTRY_BENCHMARKS.default;
      const efficiencyRatio = costPerUser > 0 ? benchmark.cost_per_user / costPerUser : 0;

      return JSON.stringify({
        service: input.service,
        monthly_spending: monthlySpending,
        cost_per_user: costPerUser,
        cost_per_request: costPerRequest,
        benchmark_cost_per_user: benchmark.cost_per_user,
        efficiency_ratio: efficiencyRatio,
      });
    } catch (error) {
      return JSON.stringify({ error: `Calculation failed: ${error}` });
    }
  },
  {
    name: "calculate_unit_economics",
    description: "Calculate unit economics for a service. Compare spending against industry benchmarks.",
    schema: z.object({
      user_id: z.string().describe("User ID"),
      service: z.string().describe("Service name"),
      total_users: z.number().describe("Total number of users"),
      total_requests: z.number().describe("Total number of requests"),
    }),
  }
);

export const databaseTools = [getBrexSpending, getRepositoryContext, getExistingIssues, calculateUnitEconomics];

