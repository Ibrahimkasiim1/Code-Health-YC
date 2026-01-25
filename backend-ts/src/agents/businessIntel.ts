import { BaseAgent } from "./base.js";
import type { Issue } from "../db.js";

interface CodeAnalysis {
  title: string;
  description: string;
  root_cause: string;
  affected_code_snippet?: string;
}

const SEARCH_PATTERNS: Record<string, string[]> = {
  openai: ["openai", "ChatCompletion", "Completion.create", "chat.completions"],
  anthropic: ["anthropic", "Anthropic", "claude", "messages.create"],
  stripe: ["stripe", "Stripe"],
};

export class BusinessIntelAgent extends BaseAgent {
  async run(
    userId: string,
    repoId: string,
    accessToken: string,
    owner: string,
    repo: string,
    totalUsers: number = 100,
    totalRequests: number = 10000
  ): Promise<Issue[]> {
    const issues: Issue[] = [];
    const spending = await this.mcpClient.getSpendingSummary(userId, 30);

    const services = Object.entries(spending.by_service);
    for (const [service, data] of services) {
      if (data.amount < 50) continue;

      const economics = await this.mcpClient.calculateUnitEconomics(
        userId,
        service,
        totalUsers,
        totalRequests
      );

      if (economics.efficiency_ratio >= 0.5) continue;

      const issue = await this.analyzeServiceUsage(
        accessToken,
        owner,
        repo,
        repoId,
        service,
        economics,
        totalUsers
      );
      if (issue) issues.push(issue);
    }

    return issues;
  }

  private async analyzeServiceUsage(
    accessToken: string,
    owner: string,
    repo: string,
    repoId: string,
    service: string,
    economics: {
      monthly_spending: number;
      cost_per_user: number;
      benchmark_cost_per_user: number;
      efficiency_ratio: number;
    },
    totalUsers: number
  ): Promise<Issue | null> {
    const patterns = SEARCH_PATTERNS[service.toLowerCase()] ?? [service];
    const codeLocations: Array<{ path: string }> = [];

    for (const pattern of patterns) {
      const results = await this.searchGitHubCode(accessToken, owner, repo, pattern);
      for (const result of results) {
        if (!codeLocations.some((loc) => loc.path === result.path)) {
          codeLocations.push({ path: result.path });
        }
      }
    }

    if (codeLocations.length === 0) return null;

    const primaryFile = codeLocations[0].path;
    const fileContent = await this.getGitHubFile(accessToken, owner, repo, primaryFile);
    if (!fileContent) return null;

    const analysis = await this.analyzeCodeWithLLM(
      service,
      economics,
      primaryFile,
      fileContent
    );

    const monthlySpend = economics.monthly_spending;
    const benchmarkSpend = economics.benchmark_cost_per_user * totalUsers;
    const potentialSavings = Math.max(0, monthlySpend - benchmarkSpend);

    const fallbackDescription = `Your ${service} API spending is significantly above industry benchmarks.

Current monthly spend: $${monthlySpend.toFixed(2)}
Cost per user: $${economics.cost_per_user.toFixed(2)}
Benchmark: $${economics.benchmark_cost_per_user.toFixed(2)}/user

Consider adding caching or reducing redundant calls in ${primaryFile}.`;

    let severity: "low" | "medium" | "high" | "critical" = "low";
    if (monthlySpend > 500) severity = "critical";
    else if (monthlySpend > 100) severity = "high";
    else if (monthlySpend > 50) severity = "medium";

    const metrics = {
      monthly_spending: monthlySpend,
      cost_per_user: economics.cost_per_user,
      benchmark_cost_per_user: economics.benchmark_cost_per_user,
      efficiency_ratio: economics.efficiency_ratio,
      potential_monthly_savings: potentialSavings,
      potential_weekly_savings: potentialSavings / 4,
      affected_files: codeLocations.map((loc) => loc.path),
    };

    const issue = await this.saveIssue(
      repoId,
      "business_intel",
      "cost_optimization",
      analysis?.title ?? `High ${service} API Costs Detected`,
      analysis?.description ?? fallbackDescription,
      severity,
      metrics,
      primaryFile
    );

    return issue;
  }

  private async analyzeCodeWithLLM(
    service: string,
    economics: {
      monthly_spending: number;
      cost_per_user: number;
      benchmark_cost_per_user: number;
      efficiency_ratio: number;
    },
    filePath: string,
    fileContent: string
  ): Promise<CodeAnalysis | null> {
    const systemPrompt =
      "You are a code health analyst specializing in API cost optimization. Respond ONLY with valid JSON.";

    const userPrompt = `Analyze this code for ${service} API usage inefficiencies.

## Spending Data
- Monthly spending: $${economics.monthly_spending.toFixed(2)}
- Cost per user: $${economics.cost_per_user.toFixed(2)}
- Industry benchmark: $${economics.benchmark_cost_per_user.toFixed(2)}/user
- Efficiency: ${(economics.efficiency_ratio * 100).toFixed(1)}% (lower means more expensive than benchmark)

## File: ${filePath}
\`\`\`
${fileContent.slice(0, 3000)}
\`\`\`

Respond in JSON format:
{
  "title": "Short title describing the issue (max 60 chars)",
  "description": "Detailed description including: what's wrong, why it's costly, and recommended fix approach",
  "root_cause": "One of: missing_cache, no_batching, redundant_calls, inefficient_prompts, other",
  "affected_code_snippet": "Optional snippet"
}`;

    return this.invokeLLMForJSON<CodeAnalysis>(systemPrompt, userPrompt);
  }
}
