import { getSupabase } from "../db.js";
import { INDUSTRY_BENCHMARKS, type SpendingSummary, type UnitEconomics } from "../types/index.js";

export interface MCPClient {
  getSpendingSummary(userId: string, days?: number): Promise<SpendingSummary>;
  calculateUnitEconomics(
    userId: string,
    service: string,
    totalUsers: number,
    totalRequests: number
  ): Promise<UnitEconomics>;
  getRepositoryContext(repoId: string): Promise<Record<string, unknown> | null>;
}

class DirectDataAccess implements MCPClient {
  private supabase = getSupabase();

  async getSpendingSummary(userId: string, days: number = 30): Promise<SpendingSummary> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { data, error } = await this.supabase
      .from("brex_transactions")
      .select("*")
      .eq("user_id", userId)
      .gte("transaction_date", cutoff.toISOString());

    if (error || !data) {
      return {
        total_spending: 0,
        by_service: {},
        transaction_count: 0,
        period_days: days,
      };
    }

    const byService: Record<string, { amount: number; count: number }> = {};
    let total = 0;

    for (const tx of data) {
      const service = (tx.detected_service || tx.merchant || "unknown").toLowerCase();
      const amount = Number(tx.amount) || 0;
      total += amount;
      if (!byService[service]) {
        byService[service] = { amount: 0, count: 0 };
      }
      byService[service].amount += amount;
      byService[service].count += 1;
    }

    return {
      total_spending: total,
      by_service: byService,
      transaction_count: data.length,
      period_days: days,
    };
  }

  async calculateUnitEconomics(
    userId: string,
    service: string,
    totalUsers: number,
    totalRequests: number
  ): Promise<UnitEconomics> {
    const spending = await this.getSpendingSummary(userId, 30);
    const serviceKey = service.toLowerCase();
    const serviceSpend = spending.by_service[serviceKey]?.amount ?? 0;

    const costPerUser = totalUsers > 0 ? serviceSpend / totalUsers : 0;
    const costPerRequest = totalRequests > 0 ? serviceSpend / totalRequests : 0;

    const benchmark = INDUSTRY_BENCHMARKS[serviceKey] || INDUSTRY_BENCHMARKS.default;
    const efficiencyRatio = costPerUser > 0 ? benchmark.cost_per_user / costPerUser : 0;

    return {
      service: serviceKey,
      monthly_spending: serviceSpend,
      cost_per_user: costPerUser,
      cost_per_request: costPerRequest,
      benchmark_cost_per_user: benchmark.cost_per_user,
      efficiency_ratio: efficiencyRatio,
    };
  }

  async getRepositoryContext(repoId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.supabase
      .from("repository_contexts")
      .select("context_json")
      .eq("repo_id", repoId)
      .single();

    if (error || !data) return null;
    return (data.context_json as Record<string, unknown>) ?? null;
  }
}

export function getMcpClient(): MCPClient {
  return new DirectDataAccess();
}
