import { BaseAgent } from "./base.js";
import { SYSTEM_PROMPTS } from "../services/gemini.js";
import type { TechStackContext } from "../types/index.js";

const CONFIG_FILES = [
  "package.json",
  "requirements.txt",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  ".env.example",
  "docker-compose.yml",
  "Dockerfile",
];

interface ContextAnalysisResult {
  languages: string[];
  frameworks: string[];
  databases: string[];
  apis: string[];
  infrastructure: string[];
}

export class ContextAgent extends BaseAgent {
  async run(
    accessToken: string,
    owner: string,
    repo: string,
    repoId: string
  ): Promise<TechStackContext> {
    // Fetch configuration files
    const fileContents: Record<string, string> = {};

    for (const file of CONFIG_FILES) {
      const content = await this.getGitHubFile(accessToken, owner, repo, file);
      if (content) {
        fileContents[file] = content;
      }
    }

    // Build prompt with file contents
    const filesText = Object.entries(fileContents)
      .map(([name, content]) => `=== ${name} ===\n${content}`)
      .join("\n\n");

    if (!filesText) {
      const emptyContext = this.buildEmptyContext();
      await this.saveContext(repoId, emptyContext);
      return emptyContext;
    }

    // Analyze with LLM
    const userPrompt = `Analyze these configuration files and identify the technology stack:\n\n${filesText}`;

    const analysis = await this.invokeLLMForJSON<ContextAnalysisResult>(
      SYSTEM_PROMPTS.contextAnalysis,
      userPrompt
    );

    if (!analysis) {
      return this.buildEmptyContext();
    }

    const context: TechStackContext = {
      languages: analysis.languages || [],
      frameworks: analysis.frameworks || [],
      databases: analysis.databases || [],
      apis: analysis.apis || [],
      infrastructure: analysis.infrastructure || [],
      stack_summary: this.buildStackSummary(analysis),
    };

    // Save context to database
    await this.saveContext(repoId, context);

    return context;
  }

  private buildEmptyContext(): TechStackContext {
    return {
      languages: [],
      frameworks: [],
      databases: [],
      apis: [],
      infrastructure: [],
      stack_summary: "Unable to detect technology stack",
    };
  }

  private buildStackSummary(analysis: ContextAnalysisResult): string {
    const parts: string[] = [];

    if (analysis.languages?.length) {
      parts.push(`Languages: ${analysis.languages.join(", ")}`);
    }
    if (analysis.frameworks?.length) {
      parts.push(`Frameworks: ${analysis.frameworks.join(", ")}`);
    }
    if (analysis.databases?.length) {
      parts.push(`Databases: ${analysis.databases.join(", ")}`);
    }
    if (analysis.apis?.length) {
      parts.push(`APIs: ${analysis.apis.join(", ")}`);
    }

    return parts.join(" | ") || "No stack detected";
  }

  private async saveContext(repoId: string, context: TechStackContext): Promise<void> {
    const payload = {
      repo_id: repoId,
      context_json: context,
      stack_summary: context.stack_summary,
      analyzed_at: new Date().toISOString(),
    };

    await this.supabase
      .from("repository_contexts")
      .upsert(payload, { onConflict: "repo_id" });
  }
}
