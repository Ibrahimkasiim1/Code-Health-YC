import { z } from "zod";

/**
 * Standard Issue Output Schema
 * All analysis agents must output issues in this format
 */
export const IssueSchema = z.object({
  issue_id: z.string().describe("Unique identifier for the issue"),
  type: z.enum([
    "security_vulnerability",
    "cost_inefficiency",
    "runtime_error",
    "performance_bottleneck",
    "database_inefficiency",
    "ux_issue",
  ]).describe("Type of issue"),
  severity: z.enum(["critical", "high", "medium", "low"]).describe("Severity level"),
  title: z.string().describe("Brief, descriptive title"),
  description: z.string().describe("Detailed description of the issue"),
  file_path: z.string().describe("Path to the affected file"),
  line_start: z.number().describe("Starting line number"),
  line_end: z.number().describe("Ending line number"),
  code_snippet: z.string().describe("Relevant code snippet"),
  root_cause: z.string().describe("Explanation of why this is happening"),
  impact: z.string().describe("Business/technical impact"),
  suggested_fix: z.string().describe("Recommended fix"),
  confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
  agent: z.string().describe("Name of the agent that found this issue"),
  metadata: z.record(z.unknown()).optional().describe("Additional agent-specific data"),
});

export type Issue = z.infer<typeof IssueSchema>;

export const IssueArraySchema = z.array(IssueSchema);

/**
 * Agent output schema - what each agent returns
 */
export const AgentOutputSchema = z.object({
  agent_name: z.string(),
  status: z.enum(["success", "partial", "error"]),
  issues: IssueArraySchema,
  summary: z.string(),
  execution_time_ms: z.number(),
  error: z.string().optional(),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

/**
 * Context Agent specific output
 */
export const RepositoryContextSchema = z.object({
  languages: z.array(z.object({
    name: z.string(),
    percentage: z.number(),
    files: z.number(),
  })),
  frameworks: z.array(z.string()),
  databases: z.array(z.string()),
  apis: z.array(z.object({
    path: z.string(),
    method: z.string(),
    file: z.string(),
  })),
  infrastructure: z.array(z.string()),
  entry_points: z.array(z.string()),
  dependencies: z.array(z.object({
    name: z.string(),
    version: z.string(),
    dev: z.boolean(),
  })),
  stack_summary: z.string(),
});

export type RepositoryContext = z.infer<typeof RepositoryContextSchema>;

/**
 * Helper to generate unique issue IDs
 */
export function generateIssueId(agentName: string, type: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${agentName.toLowerCase()}-${type}-${timestamp}-${random}`;
}

/**
 * Helper to create a standardized issue
 */
export function createIssue(
  agent: string,
  type: Issue["type"],
  data: Omit<Issue, "issue_id" | "agent" | "type">
): Issue {
  return {
    issue_id: generateIssueId(agent, type),
    agent,
    type,
    ...data,
  };
}

