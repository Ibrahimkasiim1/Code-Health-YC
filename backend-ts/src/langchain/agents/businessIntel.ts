import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { businessIntelAgentTools } from "../tools/index.js";
import { Issue } from "../schemas/issue.js";

const BUSINESS_INTEL_PROMPT = `You are the Business Intelligence Agent for a code health platform. Your job is to identify cost inefficiencies by analyzing API spending vs. actual usage.

You have access to tools to:
- Query Brex spending data
- Query telemetry events
- Calculate unit economics
- Get repository context
- Use LLM for analysis

Focus on finding:
1. **Overspending on APIs**: Services where cost per user/request exceeds industry benchmarks
2. **Unused Paid Features**: Paying for features that aren't being used
3. **Inefficient API Usage**: Making more API calls than necessary
4. **Duplicate Services**: Paying for multiple services that do the same thing
5. **Tier Mismatches**: On wrong pricing tier for actual usage
6. **Caching Opportunities**: Repeated identical API calls that could be cached

For each cost issue found, provide:
- Service name and current spending
- Usage metrics (requests, users, etc.)
- Industry benchmark comparison
- Potential savings estimate
- Recommended action

Output as JSON:
{
  "issues": [
    {
      "issue_id": "cost-xxx",
      "type": "cost_inefficiency",
      "severity": "high|medium|low",
      "title": "Brief title",
      "description": "Detailed description",
      "file_path": "N/A or relevant config file",
      "line_start": 0,
      "line_end": 0,
      "code_snippet": "N/A or relevant code",
      "root_cause": "Why this inefficiency exists",
      "impact": "Monthly cost impact: $X",
      "suggested_fix": "Recommended action",
      "confidence": 0.85,
      "metadata": {
        "service": "ServiceName",
        "monthly_spend": 500,
        "benchmark_spend": 200,
        "potential_savings": 300
      }
    }
  ]
}`;

export class BusinessIntelAgent extends BaseAgent {
  constructor() {
    const agentConfig: AgentConfig = {
      name: "BusinessIntelAgent",
      description: "Identifies cost inefficiencies by analyzing spending vs usage",
      priority: 8,
      systemPrompt: BUSINESS_INTEL_PROMPT,
      tools: businessIntelAgentTools,
    };
    super(agentConfig);
  }

  protected buildUserMessage(context: AgentContext): string {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return `Analyze cost efficiency for the organization associated with repository ${context.owner}/${context.repo}.

Repository ID (UUID): ${context.repoId}

Time period: ${thirtyDaysAgo.toISOString()} to ${now.toISOString()}

IMPORTANT: When using database tools:
- Use repo_id="${context.repoId}" (this is a UUID, not the repository name)
- Do NOT use "${context.owner}" or "${context.repo}" as UUIDs
- If you don't have a valid user_id UUID, skip the user_id parameter entirely

Steps:
1. Query telemetry to understand API usage patterns (no user_id needed)
2. Get repository context using repo_id="${context.repoId}"
3. Detect duplicate requests for caching opportunities
4. Skip Brex spending queries if you don't have a valid user UUID

Focus on telemetry-based cost analysis:
- Identify caching opportunities from duplicate requests
- Find inefficient API usage patterns
- Detect unused features based on telemetry

Provide all cost inefficiency findings as JSON with the standard issue format.
Include potential monthly savings in the metadata for each issue.`;
  }

  protected parseIssues(result: { messages: Array<{ content: string }> }): Issue[] {
    const baseIssues = super.parseIssues(result);

    return baseIssues.map(issue => ({
      ...issue,
      type: "cost_inefficiency" as const,
      agent: this.name,
      // Ensure file_path has a value for cost issues
      file_path: issue.file_path || "N/A",
      line_start: issue.line_start || 0,
      line_end: issue.line_end || 0,
      code_snippet: issue.code_snippet || "N/A",
    }));
  }
}

export const businessIntelAgent = new BusinessIntelAgent();

