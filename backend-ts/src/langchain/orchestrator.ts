import { contextAgent, analysisAgents, fixAgent, AgentContext, FixResult } from "./agents/index.js";
import { AgentOutput, Issue, RepositoryContext } from "./schemas/issue.js";
import { getSupabase } from "../db.js";

export interface OrchestrationResult {
  repository_context: RepositoryContext | null;
  agent_results: AgentOutput[];
  all_issues: Issue[];
  summary: {
    total_issues: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
    by_agent: Record<string, number>;
  };
  execution_time_ms: number;
}

/**
 * Orchestrates the execution of all agents
 * 1. Context Agent runs first (blocking)
 * 2. Analysis Agents run in parallel
 */
export class AgentOrchestrator {
  /**
   * Run full analysis on a repository
   */
  async analyzeRepository(context: AgentContext): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const agentResults: AgentOutput[] = [];
    let repositoryContext: RepositoryContext | null = null;

    console.log(`[Orchestrator] Starting analysis for ${context.owner}/${context.repo}`);

    // Step 1: Run Context Agent (blocking)
    console.log("[Orchestrator] Running Context Agent...");
    try {
      repositoryContext = await contextAgent.executeAndSave(context);
      console.log("[Orchestrator] Context Agent completed");
    } catch (error) {
      console.error("[Orchestrator] Context Agent failed:", error);
    }

    // Step 2: Run Analysis Agents in parallel
    console.log("[Orchestrator] Running Analysis Agents in parallel...");
    const contextWithRepo: AgentContext = {
      ...context,
      repositoryContext: repositoryContext as unknown as Record<string, unknown>,
    };

    const analysisPromises = analysisAgents.map(async (agent) => {
      console.log(`[Orchestrator] Starting ${agent.getName()}...`);
      try {
        const result = await agent.execute(contextWithRepo);
        console.log(`[Orchestrator] ${agent.getName()} completed: ${result.issues.length} issues`);
        return result;
      } catch (error) {
        console.error(`[Orchestrator] ${agent.getName()} failed:`, error);
        return {
          agent_name: agent.getName(),
          status: "error" as const,
          issues: [],
          summary: `Agent failed: ${error}`,
          execution_time_ms: 0,
          error: String(error),
        };
      }
    });

    const results = await Promise.all(analysisPromises);
    agentResults.push(...results);

    // Collect all issues
    const allIssues = agentResults.flatMap((r) => r.issues);

    // Generate summary
    const summary = this.generateSummary(allIssues);

    // Save issues to database
    await this.saveIssues(context.repoId, allIssues);

    const executionTime = Date.now() - startTime;
    console.log(`[Orchestrator] Analysis complete in ${executionTime}ms. Found ${allIssues.length} issues.`);

    return {
      repository_context: repositoryContext,
      agent_results: agentResults,
      all_issues: allIssues,
      summary,
      execution_time_ms: executionTime,
    };
  }

  /**
   * Generate a fix for a specific issue
   */
  async generateFix(context: AgentContext, issueId: string): Promise<FixResult | null> {
    // Fetch the issue from database
    const supabase = getSupabase();
    const { data: issue, error } = await supabase
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .single();

    if (error || !issue) {
      console.error(`[Orchestrator] Issue not found: ${issueId}`);
      return null;
    }

    // Convert database issue to Issue type
    const issueData: Issue = {
      issue_id: issue.id,
      type: issue.issue_type,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      file_path: issue.file_path,
      line_start: issue.line_start || 0,
      line_end: issue.line_end || 0,
      code_snippet: issue.code_snippet || "",
      root_cause: issue.root_cause || "",
      impact: issue.impact || "",
      suggested_fix: issue.suggested_fix || "",
      confidence: issue.confidence || 0.5,
      agent: issue.agent || "unknown",
    };

    return fixAgent.generateFix(context, issueData);
  }

  private generateSummary(issues: Issue[]) {
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    for (const issue of issues) {
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
      byType[issue.type] = (byType[issue.type] || 0) + 1;
      byAgent[issue.agent] = (byAgent[issue.agent] || 0) + 1;
    }

    return { total_issues: issues.length, by_severity: bySeverity, by_type: byType, by_agent: byAgent };
  }

  private async saveIssues(repoId: string, issues: Issue[]) {
    if (issues.length === 0) return;

    const supabase = getSupabase();
    const records = issues.map((issue) => ({
      repo_id: repoId,
      agent_type: issue.agent, // Map agent name to agent_type column
      issue_type: issue.type,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      file_path: issue.file_path,
      line_start: issue.line_start,
      line_end: issue.line_end,
      code_snippet: issue.code_snippet,
      root_cause: issue.root_cause,
      impact: issue.impact,
      suggested_fix: issue.suggested_fix,
      confidence: issue.confidence,
      agent: issue.agent, // Also keep agent column for backwards compatibility
      status: "open",
    }));

    const { error } = await supabase.from("issues").insert(records);
    if (error) console.error("[Orchestrator] Failed to save issues:", error);
  }
}

export const orchestrator = new AgentOrchestrator();

