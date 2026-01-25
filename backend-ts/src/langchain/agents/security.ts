import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { securityAgentTools } from "../tools/index.js";
import { Issue, createIssue } from "../schemas/issue.js";

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
1. Search for hardcoded secrets (API keys, passwords, tokens)
2. Check authentication and authorization code
3. Look for SQL/NoSQL injection vulnerabilities
4. Find XSS vulnerabilities in frontend code
5. Check dependencies for known CVEs
6. Review file upload and path handling

Provide all findings as JSON with the standard issue format.`;
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

