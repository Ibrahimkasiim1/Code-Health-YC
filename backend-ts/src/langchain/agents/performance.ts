import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { performanceAgentTools } from "../tools/index.js";
import { Issue } from "../schemas/issue.js";

const PERFORMANCE_AGENT_PROMPT = `You are the Performance Agent for a code health platform. Your job is to identify slow endpoints and caching opportunities.

You have access to tools to:
- Calculate latency percentiles for endpoints
- Detect duplicate requests (caching opportunities)
- Query telemetry events
- Search and read files from GitHub
- Parse code structure
- Use LLM for performance analysis

Focus on finding:
1. **Slow Endpoints**: p95 latency > 500ms or p99 > 1000ms
2. **Caching Opportunities**: Identical requests within short time windows
3. **N+1 Queries**: Database queries in loops
4. **Missing Indexes**: Slow database queries that could benefit from indexes
5. **Synchronous Bottlenecks**: Blocking operations that could be async
6. **Memory Leaks**: Patterns that suggest memory issues
7. **Large Payloads**: Endpoints returning excessive data

For each performance issue found, provide:
- Endpoint or code location
- Current latency metrics
- Root cause analysis
- Expected improvement after fix
- Suggested optimization

Output as JSON:
{
  "issues": [
    {
      "issue_id": "perf-xxx",
      "type": "performance_bottleneck",
      "severity": "high|medium|low",
      "title": "Brief title",
      "description": "Detailed description",
      "file_path": "path/to/file.ts",
      "line_start": 10,
      "line_end": 25,
      "code_snippet": "slow code",
      "root_cause": "Why this is slow",
      "impact": "p95: 800ms, affects X requests/day",
      "suggested_fix": "How to optimize",
      "confidence": 0.85,
      "metadata": {
        "endpoint": "/api/users",
        "p50_ms": 200,
        "p95_ms": 800,
        "p99_ms": 1500,
        "requests_per_day": 10000
      }
    }
  ]
}`;

export class PerformanceAgent extends BaseAgent {
  constructor() {
    const agentConfig: AgentConfig = {
      name: "PerformanceAgent",
      description: "Identifies slow endpoints and caching opportunities",
      priority: 6,
      systemPrompt: PERFORMANCE_AGENT_PROMPT,
      tools: performanceAgentTools,
    };
    super(agentConfig);
  }

  protected buildUserMessage(context: AgentContext): string {
    const repoContext = context.repositoryContext;
    const apis = (repoContext?.apis as Array<{ path: string }>) || [];
    
    return `Analyze performance for repository ${context.owner}/${context.repo}.

${apis.length > 0 ? `Known API endpoints: ${apis.map(a => a.path).join(", ")}` : ""}

Steps:
1. Calculate latency percentiles for all endpoints over the last 7 days
2. Identify endpoints with p95 > 500ms or p99 > 1000ms
3. For slow endpoints, analyze the code to find bottlenecks
4. Detect duplicate requests that could be cached
5. Look for N+1 query patterns in the code
6. Check for synchronous operations that could be async

Provide all performance issues as JSON with the standard issue format.
Include latency metrics in the metadata for each issue.`;
  }

  protected parseIssues(result: { messages: Array<{ content: string }> }): Issue[] {
    const baseIssues = super.parseIssues(result);
    
    return baseIssues.map(issue => ({
      ...issue,
      type: "performance_bottleneck" as const,
      agent: this.name,
    }));
  }
}

export const performanceAgent = new PerformanceAgent();

