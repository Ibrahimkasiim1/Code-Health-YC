import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { errorAgentTools } from "../tools/index.js";
import { Issue } from "../schemas/issue.js";

const ERROR_AGENT_PROMPT = `You are the Error Agent for a code health platform. Your job is to identify recurring runtime errors and their root causes.

You have access to tools to:
- Query error events from telemetry
- Search and read files from GitHub
- Use LLM to analyze error patterns and find root causes

Focus on finding:
1. **Recurring Errors**: Errors that happen repeatedly
2. **High-Impact Errors**: Errors affecting many users
3. **Unhandled Exceptions**: Missing try-catch blocks
4. **Silent Failures**: Errors that are caught but not properly handled
5. **Error Cascades**: One error causing multiple downstream errors
6. **Missing Error Boundaries**: React components without error boundaries

For each error pattern found, provide:
- Error message and stack trace pattern
- Frequency and affected users
- File and line where error originates
- Root cause analysis
- Suggested fix

Output as JSON:
{
  "issues": [
    {
      "issue_id": "err-xxx",
      "type": "runtime_error",
      "severity": "critical|high|medium|low",
      "title": "Brief title",
      "description": "Detailed description",
      "file_path": "path/to/file.ts",
      "line_start": 10,
      "line_end": 15,
      "code_snippet": "problematic code",
      "root_cause": "Why this error occurs",
      "impact": "X users affected, Y occurrences/day",
      "suggested_fix": "How to fix it",
      "confidence": 0.9,
      "metadata": {
        "error_count": 150,
        "affected_users": 45,
        "first_seen": "2024-01-01",
        "last_seen": "2024-01-15"
      }
    }
  ]
}`;

export class ErrorAgent extends BaseAgent {
  constructor() {
    const agentConfig: AgentConfig = {
      name: "ErrorAgent",
      description: "Identifies recurring runtime errors and their root causes",
      priority: 7,
      systemPrompt: ERROR_AGENT_PROMPT,
      tools: errorAgentTools,
    };
    super(agentConfig);
  }

  protected buildUserMessage(context: AgentContext): string {
    return `Analyze runtime errors for repository ${context.owner}/${context.repo}.

Steps:
1. Query error events from the last 7 days, grouped by error message
2. Identify the most frequent and impactful errors
3. For top errors, find the source file and line number
4. Analyze the code to understand the root cause
5. Check for missing error handling patterns
6. Suggest fixes for each error pattern

Focus on errors that:
- Occur more than 10 times
- Affect more than 5 users
- Have been recurring for more than 24 hours

Provide all findings as JSON with the standard issue format.`;
  }

  protected parseIssues(result: { messages: Array<{ content: string }> }): Issue[] {
    const baseIssues = super.parseIssues(result);
    
    return baseIssues.map(issue => ({
      ...issue,
      type: "runtime_error" as const,
      agent: this.name,
    }));
  }
}

export const errorAgent = new ErrorAgent();

