import { getSupabase } from "../db.js";
import { invokeLLM, invokeLLMForJSON } from "../services/gemini.js";
import * as github from "../services/github.js";
import { getMcpClient } from "../mcp/client.js";
import type { Issue, Fix } from "../db.js";

export abstract class BaseAgent {
  protected supabase = getSupabase();
  protected mcpClient = getMcpClient();

  // Invoke LLM with prompts
  protected async invokeLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    return invokeLLM(systemPrompt, userPrompt);
  }

  // Invoke LLM and parse JSON response
  protected async invokeLLMForJSON<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
    return invokeLLMForJSON<T>(systemPrompt, userPrompt);
  }

  // Get file from GitHub
  protected async getGitHubFile(
    accessToken: string,
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<string | null> {
    return github.getFileContent(accessToken, owner, repo, path, ref);
  }

  // Search code in repository
  protected async searchGitHubCode(
    accessToken: string,
    owner: string,
    repo: string,
    query: string
  ): Promise<Array<{ path: string; sha: string }>> {
    return github.searchCode(accessToken, owner, repo, query);
  }

  // Save issue to database
  protected async saveIssue(
    repoId: string,
    agentType: string,
    issueType: string,
    title: string,
    description: string,
    severity: "low" | "medium" | "high" | "critical",
    metrics?: Record<string, unknown>,
    filePath?: string
  ): Promise<Issue | null> {
    const { data, error } = await this.supabase
      .from("issues")
      .insert({
        repo_id: repoId,
        agent_type: agentType,
        issue_type: issueType,
        title,
        description,
        severity,
        status: "open",
        metrics,
        file_path: filePath,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving issue:", error);
      return null;
    }

    return data as Issue;
  }

  // Save fix to database
  protected async saveFix(
    issueId: string,
    originalCode: string,
    fixedCode: string,
    diff: string,
    confidenceScore: number,
    explanation: string
  ): Promise<Fix | null> {
    const { data, error } = await this.supabase
      .from("fixes")
      .insert({
        issue_id: issueId,
        original_code: originalCode,
        fixed_code: fixedCode,
        diff,
        confidence_score: confidenceScore,
        explanation,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving fix:", error);
      return null;
    }

    return data as Fix;
  }

  // Abstract method for running the agent
  abstract run(...args: unknown[]): Promise<unknown>;
}
