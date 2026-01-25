import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { securityAgentTools } from "../tools/index.js";
import { Issue, createIssue } from "../schemas/issue.js";
import { AgentOutput } from "../schemas/issue.js";
import { fetchRepositoryFiles, shouldSkipSecurityFile } from "../utils/fileUtils.js";
import {
  scanForSecrets,
  detectSQLInjections,
  detectXSSVulnerabilities,
  detectUnhandledPromises,
} from "../tools/securityAnalysis.js";

const SECURITY_AGENT_PROMPT = `You are the Security Agent for a code health platform.

You have already been provided with detected security issues from static analysis.
Your job is to:
1. Review the detected issues
2. Add additional context and severity assessment
3. Provide detailed remediation guidance
4. Identify any patterns or systemic issues

Focus on high-impact vulnerabilities and provide actionable fixes.`;

interface FileContent {
  path: string;
  content: string;
}

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
    return `Analyze security issues for ${context.owner}/${context.repo}`;
  }

  /**
   * Execute security analysis using direct static analysis + LLM review
   */
  async execute(context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      console.log(`[SecurityAgent] Starting analysis for ${context.owner}/${context.repo}`);

      // Step 1: Fetch source files from GitHub
      const files = await fetchRepositoryFiles(context, {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rb', '.php'],
        maxFiles: 100,
      });
      console.log(`[SecurityAgent] Fetched ${files.length} source files`);

      // Step 2: Run static analysis tools directly (no LLM needed for detection)
      const issues: Issue[] = [];

      for (const file of files) {
        // Skip environment and config files
        if (shouldSkipSecurityFile(file.path)) {
          continue;
        }

        // Scan for secrets
        const secretMatches = scanForSecrets(file.content, file.path);
        for (const match of secretMatches) {
          issues.push(createIssue("SecurityAgent", "security_vulnerability", {
            severity: match.severity,
            title: match.description,
            description: `Found ${match.type} in ${file.path} at line ${match.line_number}`,
            file_path: file.path,
            line_start: match.line_number,
            line_end: match.line_number,
            code_snippet: match.match.substring(0, 50) + "...",
            root_cause: "Hardcoded secret in source code",
            impact: "Secrets exposed in repository can be accessed by anyone with repo access",
            suggested_fix: `1. Remove the secret from code\n2. Store in environment variables\n3. Rotate the exposed secret immediately\n4. Add to .gitignore`,
            confidence: 0.95,
          }));
        }

        // Detect SQL injections (TypeScript/JavaScript files only)
        if (/\.(ts|tsx|js|jsx)$/.test(file.path)) {
          const sqlIssues = detectSQLInjections(file.content, file.path);
          for (const sqlIssue of sqlIssues) {
            issues.push(createIssue("SecurityAgent", "security_vulnerability", {
              severity: sqlIssue.severity,
              title: "SQL Injection Vulnerability",
              description: sqlIssue.description,
              file_path: sqlIssue.file_path,
              line_start: sqlIssue.line_number,
              line_end: sqlIssue.line_number,
              code_snippet: sqlIssue.code_snippet,
              root_cause: `SQL query using ${sqlIssue.query_type} with user input`,
              impact: "Attackers can execute arbitrary SQL queries, access sensitive data, or modify database",
              suggested_fix: "Use parameterized queries or an ORM with proper escaping",
              confidence: 0.9,
            }));
          }

          // Detect XSS vulnerabilities
          const xssIssues = detectXSSVulnerabilities(file.content, file.path);
          for (const xssIssue of xssIssues) {
            issues.push(createIssue("SecurityAgent", "security_vulnerability", {
              severity: xssIssue.severity,
              title: "Cross-Site Scripting (XSS) Vulnerability",
              description: xssIssue.description,
              file_path: xssIssue.file_path,
              line_start: xssIssue.line_number,
              line_end: xssIssue.line_number,
              code_snippet: xssIssue.code_snippet,
              root_cause: `Using ${xssIssue.vulnerability_type} without sanitization`,
              impact: "Attackers can inject malicious scripts, steal cookies, or perform actions as the user",
              suggested_fix: "Sanitize user input using DOMPurify or avoid innerHTML/dangerouslySetInnerHTML",
              confidence: 0.85,
            }));
          }

          // Detect unhandled promises
          const promiseIssues = detectUnhandledPromises(file.content, file.path);
          for (const promiseIssue of promiseIssues) {
            issues.push(createIssue("SecurityAgent", "security_vulnerability", {
              severity: promiseIssue.severity,
              title: "Unhandled Promise Rejection",
              description: promiseIssue.description,
              file_path: promiseIssue.file_path,
              line_start: promiseIssue.line_number,
              line_end: promiseIssue.line_number,
              code_snippet: promiseIssue.code_snippet,
              root_cause: `${promiseIssue.promise_type} without error handling`,
              impact: "Unhandled errors can crash the application or expose sensitive error information",
              suggested_fix: "Add .catch() handler or wrap in try-catch block",
              confidence: 0.8,
            }));
          }
        }
      }

      console.log(`[SecurityAgent] Found ${issues.length} security issues`);

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
}

export const securityAgent = new SecurityAgent();
