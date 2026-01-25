import { BaseAgent } from "./base.js";
import { SYSTEM_PROMPTS } from "../services/gemini.js";
import { createTwoFilesPatch, diffChars } from "diff";

function extractCodeBlock(response: string): string {
  const match = response.match(/```[a-z]*\n([\s\S]*?)```/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return response.trim();
}

export class FixAgent extends BaseAgent {
  async run(...args: unknown[]): Promise<unknown> {
    const [issueId, accessToken, owner, repo] = args as [
      string,
      string,
      string,
      string
    ];
    if (!issueId || !accessToken || !owner || !repo) return null;
    return this.generateFix(issueId, accessToken, owner, repo);
  }

  async generateFix(
    issueId: string,
    accessToken: string,
    owner: string,
    repo: string
  ): Promise<Record<string, unknown> | null> {
    const { data: issue } = await this.supabase
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .single();

    const issueData = issue as {
      title?: string;
      description?: string;
      severity?: string;
      issue_type?: string;
      file_path?: string;
      metrics?: Record<string, number>;
    } | null;

    if (!issueData || !issueData.file_path) return null;

    const originalCode = await this.getGitHubFile(
      accessToken,
      owner,
      repo,
      issueData.file_path
    );
    if (!originalCode) return null;

    const fixedCode =
      issueData.issue_type === "cost_optimization"
        ? await this.generateCacheFix(issueData, issueData.file_path, originalCode)
        : await this.generateGenericFix(issueData, issueData.file_path, originalCode);

    if (!fixedCode) return null;

    const diff = this.generateDiff(originalCode, fixedCode, issueData.file_path);
    const confidence = this.calculateConfidence(originalCode, fixedCode);
    const explanation = await this.generateExplanation(issueData, originalCode, fixedCode);

    const { data: fix } = await this.supabase
      .from("fixes")
      .insert({
        issue_id: issueId,
        original_code: originalCode,
        fixed_code: fixedCode,
        diff,
        confidence_score: confidence,
        explanation,
      })
      .select()
      .single();

    return fix ?? null;
  }

  private async generateCacheFix(
    issue: {
      title?: string;
      description?: string;
      metrics?: Record<string, number>;
    },
    filePath: string,
    originalCode: string
  ): Promise<string | null> {
    const metrics = issue.metrics ?? {};
    const prompt = `Generate a fix for this API cost optimization issue.

## Issue
Title: ${issue.title ?? "Issue"}
Description: ${issue.description ?? ""}

## Current Code (${filePath})
\`\`\`
${originalCode}
\`\`\`

## Context
- Monthly API spending: $${Number(metrics.monthly_spending ?? 0).toFixed(2)}
- Potential monthly savings: $${Number(metrics.potential_monthly_savings ?? 0).toFixed(2)}
- Root cause: Missing caching layer

## Requirements
1. Add appropriate caching (Redis, in-memory, or file-based depending on the stack)
2. Choose sensible cache TTL (e.g., 5-15 minutes for AI responses)
3. Create cache keys based on the request parameters
4. Handle cache misses by calling the original API
5. Keep the existing function signatures and return types

Output ONLY the complete fixed code, no explanations. The code should be a drop-in replacement.`;

    try {
      const response = await this.invokeLLM(SYSTEM_PROMPTS.fixGeneration, prompt);
      return extractCodeBlock(response);
    } catch {
      return null;
    }
  }

  private async generateGenericFix(
    issue: {
      title?: string;
      description?: string;
      severity?: string;
    },
    filePath: string,
    originalCode: string
  ): Promise<string | null> {
    const prompt = `Generate a fix for this code issue.

## Issue
Title: ${issue.title ?? "Issue"}
Description: ${issue.description ?? ""}
Severity: ${issue.severity ?? "unknown"}

## Current Code (${filePath})
\`\`\`
${originalCode}
\`\`\`

Output ONLY the complete fixed code, no explanations.`;

    try {
      const response = await this.invokeLLM(SYSTEM_PROMPTS.fixGeneration, prompt);
      return extractCodeBlock(response);
    } catch {
      return null;
    }
  }

  private generateDiff(original: string, fixed: string, filePath: string): string {
    return createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, original, fixed);
  }

  private calculateConfidence(original: string, fixed: string): number {
    const parts = diffChars(original, fixed);
    let total = 0;
    let same = 0;
    for (const part of parts) {
      const count = part.count ?? part.value.length;
      total += count;
      if (!part.added && !part.removed) {
        same += count;
      }
    }

    const similarity = total === 0 ? 1 : same / total;
    let confidence = 0.8;

    if (similarity < 0.3) confidence -= 0.3;
    else if (similarity < 0.5) confidence -= 0.15;
    if (similarity > 0.98) confidence -= 0.2;

    const cacheKeywords = ["cache", "redis", "memo", "lru_cache", "ttl"];
    if (
      cacheKeywords.some(
        (kw) => fixed.toLowerCase().includes(kw) && !original.toLowerCase().includes(kw)
      )
    ) {
      confidence += 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private async generateExplanation(
    issue: {
      title?: string;
      metrics?: Record<string, number>;
    },
    original: string,
    fixed: string
  ): Promise<string> {
    const metrics = issue.metrics ?? {};
    const prompt = `Explain this code fix in 2-3 sentences for a developer.

## Issue
${issue.title ?? "Issue"}

## Savings
- Potential monthly savings: $${Number(metrics.potential_monthly_savings ?? 0).toFixed(2)}
- Potential weekly savings: $${Number(metrics.potential_weekly_savings ?? 0).toFixed(2)}

## What changed
The fix adds caching to reduce API calls.

Write a brief, clear explanation of what the fix does and why it saves money.`;

    try {
      const response = await this.invokeLLM(SYSTEM_PROMPTS.fixExplanation, prompt);
      return response.trim();
    } catch {
      return `This fix adds caching to reduce redundant API calls, saving an estimated $${Number(
        metrics.potential_monthly_savings ?? 0
      ).toFixed(2)} per month.`;
    }
  }
}
