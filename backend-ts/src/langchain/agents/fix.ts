import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { fixAgentTools } from "../tools/index.js";
import { Issue, AgentOutput } from "../schemas/issue.js";

const FIX_AGENT_PROMPT = `You are the Fix Agent for a code health platform. Your job is to generate code fixes for identified issues.

You have access to tools to:
- Search and read files from GitHub
- Use LLM to analyze code and suggest fixes

When generating a fix:
1. First, read the current file content
2. Understand the context around the issue
3. Generate a minimal, targeted fix
4. Ensure the fix doesn't break existing functionality
5. Follow the existing code style

Your fix should:
- Be as minimal as possible while fully addressing the issue
- Maintain backward compatibility when possible
- Include any necessary imports
- Follow the project's coding conventions
- Be ready to commit without further modification

Output as JSON:
{
  "fix": {
    "file_path": "path/to/file.ts",
    "original_code": "the code being replaced",
    "fixed_code": "the new code",
    "start_line": 10,
    "end_line": 20,
    "explanation": "What was changed and why",
    "breaking_changes": [],
    "testing_suggestions": ["How to test this fix"]
  },
  "pr_description": {
    "title": "fix: Brief description",
    "body": "## Problem\\n...\\n## Solution\\n...\\n## Testing\\n..."
  }
}`;

export interface FixResult {
  fix: {
    file_path: string;
    original_code: string;
    fixed_code: string;
    start_line: number;
    end_line: number;
    explanation: string;
    breaking_changes: string[];
    testing_suggestions: string[];
  };
  pr_description: {
    title: string;
    body: string;
  };
}

export class FixAgent extends BaseAgent {
  private targetIssue: Issue | null = null;

  constructor() {
    const agentConfig: AgentConfig = {
      name: "FixAgent",
      description: "Generates code fixes for identified issues",
      priority: 0, // On-demand, not part of regular analysis
      systemPrompt: FIX_AGENT_PROMPT,
      tools: fixAgentTools,
    };
    super(agentConfig);
  }

  /**
   * Generate a fix for a specific issue
   */
  async generateFix(context: AgentContext, issue: Issue): Promise<FixResult | null> {
    this.targetIssue = issue;
    const result = await this.execute(context);
    
    if (result.status === "error") {
      console.error(`Fix Agent failed: ${result.error}`);
      return null;
    }

    return this.parseFixResult(result);
  }

  protected buildUserMessage(context: AgentContext): string {
    if (!this.targetIssue) {
      return "No issue provided to fix.";
    }

    const issue = this.targetIssue;
    return `Generate a fix for the following issue in repository ${context.owner}/${context.repo}:

Issue ID: ${issue.issue_id}
Type: ${issue.type}
Severity: ${issue.severity}
Title: ${issue.title}

Description: ${issue.description}

File: ${issue.file_path}
Lines: ${issue.line_start} - ${issue.line_end}

Current Code:
\`\`\`
${issue.code_snippet}
\`\`\`

Root Cause: ${issue.root_cause}

Suggested Fix Direction: ${issue.suggested_fix}

Steps:
1. Read the full file to understand the context
2. Analyze the surrounding code
3. Generate a minimal fix that addresses the root cause
4. Ensure the fix follows the project's coding style
5. Provide a clear explanation and PR description

Output the fix as JSON.`;
  }

  private parseFixResult(result: AgentOutput): FixResult | null {
    try {
      const content = result.summary;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      
      return JSON.parse(jsonMatch[0]) as FixResult;
    } catch {
      return null;
    }
  }

  // Fix agent doesn't produce issues in the normal sense
  protected parseIssues(): Issue[] {
    return [];
  }
}

export const fixAgent = new FixAgent();

