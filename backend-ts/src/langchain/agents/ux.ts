import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { uxAgentTools } from "../tools/index.js";
import { Issue } from "../schemas/issue.js";

const UX_AGENT_PROMPT = `You are the UX Agent for a code health platform. Your job is to identify user experience issues by analyzing telemetry data.

You have access to tools to:
- Get session flows and user navigation paths
- Query telemetry events
- Use LLM for UX analysis

Focus on finding:
1. **High Bounce Rates**: Pages where users leave immediately
2. **Dead-End Pages**: Pages with no clear next action
3. **Rage Clicks**: Repeated clicks indicating frustration
4. **Form Abandonment**: Users starting but not completing forms
5. **Navigation Confusion**: Users going back and forth
6. **Slow Page Loads**: Pages that take too long to become interactive
7. **Error Page Visits**: Users hitting error pages frequently

For each UX issue found, provide:
- Page or flow affected
- User behavior metrics
- Impact on user experience
- Suggested improvement

Output as JSON:
{
  "issues": [
    {
      "issue_id": "ux-xxx",
      "type": "ux_issue",
      "severity": "high|medium|low",
      "title": "Brief title",
      "description": "Detailed description",
      "file_path": "path/to/component.tsx or page URL",
      "line_start": 0,
      "line_end": 0,
      "code_snippet": "N/A or relevant code",
      "root_cause": "Why users are having this issue",
      "impact": "X% bounce rate, Y users affected",
      "suggested_fix": "UX improvement suggestion",
      "confidence": 0.8,
      "metadata": {
        "page_url": "/checkout",
        "bounce_rate": 0.45,
        "sessions_analyzed": 1000,
        "affected_users": 450
      }
    }
  ]
}`;

export class UXAgent extends BaseAgent {
  constructor() {
    const agentConfig: AgentConfig = {
      name: "UXAgent",
      description: "Identifies user experience issues from telemetry data",
      priority: 4,
      systemPrompt: UX_AGENT_PROMPT,
      tools: uxAgentTools,
    };
    super(agentConfig);
  }

  protected buildUserMessage(context: AgentContext): string {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    return `Analyze user experience for the application associated with repository ${context.owner}/${context.repo}.

Time period: ${sevenDaysAgo.toISOString()} to ${now.toISOString()}

Steps:
1. Get session flows for the last 7 days
2. Calculate bounce rates for each page
3. Identify dead-end pages (pages with no outbound navigation)
4. Find pages with high exit rates
5. Look for navigation patterns indicating confusion
6. Identify pages with slow load times affecting UX

Focus on:
- Pages with bounce rate > 40%
- Flows where users abandon before completing a goal
- Pages visited frequently but with low engagement

Provide all UX issues as JSON with the standard issue format.`;
  }

  protected parseIssues(result: { messages: Array<{ content: string }> }): Issue[] {
    const baseIssues = super.parseIssues(result);
    
    return baseIssues.map(issue => ({
      ...issue,
      type: "ux_issue" as const,
      agent: this.name,
      // UX issues may not have specific file locations
      file_path: issue.file_path || "N/A",
      line_start: issue.line_start || 0,
      line_end: issue.line_end || 0,
      code_snippet: issue.code_snippet || "N/A",
    }));
  }
}

export const uxAgent = new UXAgent();

