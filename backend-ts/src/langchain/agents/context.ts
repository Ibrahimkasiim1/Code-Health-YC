import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { contextAgentTools } from "../tools/index.js";
import { RepositoryContext } from "../schemas/issue.js";
import { getSupabase } from "../../db.js";

const CONTEXT_AGENT_PROMPT = `You are the Context Agent for a code health platform. Your job is to analyze a repository and establish a baseline understanding of its structure, tech stack, and architecture.

You have access to tools to:
- Search and read files from the GitHub repository
- Parse dependencies from package manifests
- Extract API endpoints from code
- Parse code structure (functions, imports, exports)

Your task is to:
1. Identify the primary programming languages used
2. Detect frameworks (React, Express, Django, etc.)
3. Find database technologies (PostgreSQL, MongoDB, Redis, etc.)
4. Map API endpoints and their handlers
5. Identify infrastructure patterns (Docker, Kubernetes, serverless)
6. Find entry points (main files, index files)
7. List key dependencies

Output your findings as a JSON object with this structure:
{
  "languages": [{"name": "TypeScript", "percentage": 80, "files": 50}],
  "frameworks": ["React", "Express"],
  "databases": ["PostgreSQL", "Redis"],
  "apis": [{"path": "/api/users", "method": "GET", "file": "routes/users.ts"}],
  "infrastructure": ["Docker", "GitHub Actions"],
  "entry_points": ["src/index.ts", "src/app.ts"],
  "dependencies": [{"name": "express", "version": "4.18.0", "dev": false}],
  "stack_summary": "A TypeScript/React application with Express backend..."
}

Be thorough but efficient. Focus on the most important structural elements.`;

export class ContextAgent extends BaseAgent {
  constructor() {
    const agentConfig: AgentConfig = {
      name: "ContextAgent",
      description: "Analyzes repository structure and establishes baseline understanding",
      priority: 10, // Highest priority - runs first
      systemPrompt: CONTEXT_AGENT_PROMPT,
      tools: contextAgentTools,
    };
    super(agentConfig);
  }

  protected buildUserMessage(context: AgentContext): string {
    return `Analyze the repository ${context.owner}/${context.repo} and provide a comprehensive understanding of its structure and tech stack.

Start by:
1. Listing the root directory to understand the project structure
2. Looking for package.json, requirements.txt, Cargo.toml, or go.mod for dependencies
3. Finding configuration files (tsconfig.json, .env.example, docker-compose.yml)
4. Identifying the main entry points
5. Mapping out the API routes if it's a web application

Provide your complete analysis as JSON.`;
  }

  /**
   * Execute and save context to database
   */
  async executeAndSave(context: AgentContext): Promise<RepositoryContext | null> {
    const result = await this.execute(context);
    
    if (result.status === "error") {
      console.error(`Context Agent failed: ${result.error}`);
      return null;
    }

    try {
      // Parse the repository context from the agent's response
      const lastMessage = (result as unknown as { messages?: Array<{ content: string }> }).messages?.slice(-1)[0];
      const content = lastMessage?.content || result.summary;
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      
      const repoContext = JSON.parse(jsonMatch[0]) as RepositoryContext;
      
      // Save to database
      const supabase = getSupabase();
      await supabase.from("repository_contexts").upsert({
        repo_id: context.repoId,
        context_json: repoContext,
        stack_summary: repoContext.stack_summary,
        analyzed_at: new Date().toISOString(),
      });

      return repoContext;
    } catch (error) {
      console.error(`Failed to save context: ${error}`);
      return null;
    }
  }
}

export const contextAgent = new ContextAgent();

