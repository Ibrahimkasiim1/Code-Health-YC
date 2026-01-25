import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { securityAgentTools } from "../tools/index.js";
import { Issue } from "../schemas/issue.js";
import { AgentOutput } from "../schemas/issue.js";

const SECURITY_AGENT_PROMPT = `You are the Security Agent for a code health platform. Your job is to identify security vulnerabilities in the codebase.

You have access to tools to:
- Search and read files from the GitHub repository
- Parse code structure and dependencies
- Check CVE database for known vulnerabilities
- Use LLM analysis for security review

Focus on finding:
1. **Hardcoded Secrets**: API keys, passwords, tokens in code
2. **SQL Injection**: Unsanitized user input in database queries
3. **XSS Vulnerabilities**: Unescaped user input in HTML output
4. **Insecure Dependencies**: Packages with known CVEs
5. **Authentication Issues**: Weak auth, missing validation
6. **CSRF Vulnerabilities**: Missing CSRF protection
7. **Path Traversal**: Unsanitized file paths
8. **Insecure Deserialization**: Unsafe JSON/object parsing

For each vulnerability found, provide:
- Exact file path and line numbers
- Code snippet showing the vulnerability
- Root cause explanation
- Impact assessment
- Suggested fix with code example

Output as JSON:
{
  "issues": [
    {
      "issue_id": "sec-xxx",
      "type": "security_vulnerability",
      "severity": "critical|high|medium|low",
      "title": "Brief title",
      "description": "Detailed description",
      "file_path": "path/to/file.ts",
      "line_start": 10,
      "line_end": 15,
      "code_snippet": "vulnerable code",
      "root_cause": "Why this is vulnerable",
      "impact": "What could happen if exploited",
      "suggested_fix": "How to fix it",
      "confidence": 0.95
    }
  ]
}`;

export class SecurityAgent extends BaseAgent {
  constructor() {
    const agentConfig: AgentConfig = {
      name: "SecurityAgent",
      description: "Identifies security vulnerabilities in the codebase",
      priority: 9,
      systemPrompt: SECURITY_AGENT_PROMPT,
      tools: securityAgentTools,
    };
    super(agentConfig);
  }

  protected buildUserMessage(context: AgentContext): string {
    const repoContext = context.repositoryContext;
    const frameworks = (repoContext?.frameworks as string[]) || [];
    const languages = (repoContext?.languages as Array<{ name: string }>) || [];

    return `Analyze the repository ${context.owner}/${context.repo} for security vulnerabilities.

Repository Context:
- Languages: ${languages.map(l => l.name).join(", ") || "Unknown"}
- Frameworks: ${frameworks.join(", ") || "Unknown"}

Focus your analysis on:
1. Search for hardcoded secrets (API keys, passwords, tokens) in SOURCE CODE files
2. Check authentication and authorization code
3. Look for SQL/NoSQL injection vulnerabilities
4. Find XSS vulnerabilities in frontend code
5. Check dependencies for known CVEs
6. Review file upload and path handling

IMPORTANT RULES:
- DO NOT analyze .env, .env.example, .env.local, or any environment files
- DO NOT analyze config files that are meant to contain credentials
- ONLY flag secrets found in actual source code files (.ts, .js, .tsx, .jsx, .py, etc.)
- Environment files are EXPECTED to contain API keys and are not security issues

Provide all findings as JSON with the standard issue format.`;
  }

  /**
   * ✅ FIXED: Post-filter to remove false positives from environment files
   */
  async execute(context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      const agent = this.createAgent();
      const userMessage = this.buildUserMessage(context);

      const result = await agent.invoke({
        messages: [{ role: "user", content: userMessage }],
      }, {
        configurable: {
          accessToken: context.accessToken,
          owner: context.owner,
          repo: context.repo,
          repoId: context.repoId,
        },
        recursionLimit: this.getRecursionLimit(),
      });

      let issues = this.parseIssues(result);

      // ✅ Post-filter: Remove issues from environment and config files
      const envFilePatterns = [
        '.env',
        '.env.example',
        '.env.local',
        '.env.production',
        '.env.development',
        '.env.test',
        '.env.staging',
        'config.json',
        'settings.json',
        'secrets.json',
        'credentials.json',
        'docker-compose.yml',
        'docker-compose.yaml',
      ];

      const originalCount = issues.length;
      issues = issues.filter(issue => {
        const filePath = issue.file_path.toLowerCase();
        const fileName = filePath.split('/').pop() || '';

        // Check if file matches environment file patterns
        const isEnvFile = envFilePatterns.some(pattern =>
          fileName === pattern || fileName.startsWith(pattern.split('.')[0])
        );

        // Only filter out if it's a security issue in an env file
        if (isEnvFile && issue.type === 'security_vulnerability') {
          console.log(`[SecurityAgent] ✅ Filtered out false positive from ${issue.file_path}`);
          return false;
        }

        return true;
      });

      const filteredCount = originalCount - issues.length;
      if (filteredCount > 0) {
        console.log(`[SecurityAgent] Filtered ${filteredCount} false positives from env files`);
      }

      return {
        agent_name: this.name,
        status: issues.length > 0 ? "success" : "partial",
        issues,
        summary: this.generateSummary(issues),
        execution_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`[SecurityAgent] Agent execution failed:`, error);
      return {
        agent_name: this.name,
        status: "error",
        issues: [],
        summary: `Agent execution failed: ${error}`,
        execution_time_ms: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  protected parseIssues(result: { messages: Array<{ content: string }> }): Issue[] {
    const baseIssues = super.parseIssues(result);

    // Ensure all issues have the correct type
    return baseIssues.map(issue => ({
      ...issue,
      type: "security_vulnerability" as const,
      agent: this.name,
    }));
  }
}

export const securityAgent = new SecurityAgent();

