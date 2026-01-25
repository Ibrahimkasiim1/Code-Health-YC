import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { StructuredTool } from "@langchain/core/tools";
import { getConfig } from "../../config.js";
import { AgentOutput, Issue } from "../schemas/issue.js";

export interface AgentConfig {
  name: string;
  description: string;
  priority: number;
  systemPrompt: string;
  tools: StructuredTool[];
}

export interface AgentContext {
  repoId: string;
  owner: string;
  repo: string;
  accessToken: string;
  repositoryContext?: Record<string, unknown>;
}

/**
 * Base class for all LangChain agents
 */
export abstract class BaseAgent {
  protected name: string;
  protected description: string;
  protected priority: number;
  protected systemPrompt: string;
  protected tools: StructuredTool[];
  protected model: ChatGoogleGenerativeAI;

  constructor(agentConfig: AgentConfig) {
    this.name = agentConfig.name;
    this.description = agentConfig.description;
    this.priority = agentConfig.priority;
    this.systemPrompt = agentConfig.systemPrompt;
    this.tools = agentConfig.tools;
    this.model = new ChatGoogleGenerativeAI({
      apiKey: getConfig().GEMINI_API_KEY,
      model: "gemini-1.5-flash-latest",
      temperature: 0.1,
    });
  }

  /**
   * Create the LangGraph ReAct agent
   */
  protected createAgent() {
    return createReactAgent({
      llm: this.model,
      tools: this.tools,
      messageModifier: this.systemPrompt,
    });
  }

  /**
   * Execute the agent with the given context
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
        },
      });

      const issues = this.parseIssues(result);

      return {
        agent_name: this.name,
        status: issues.length > 0 ? "success" : "partial",
        issues,
        summary: this.generateSummary(issues),
        execution_time_ms: Date.now() - startTime,
      };
    } catch (error) {
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

  /**
   * Build the user message for the agent - override in subclasses
   */
  protected abstract buildUserMessage(context: AgentContext): string;

  /**
   * Parse issues from agent response - override in subclasses for custom parsing
   */
  protected parseIssues(result: { messages: Array<{ content: string }> }): Issue[] {
    try {
      const lastMessage = result.messages[result.messages.length - 1];
      const content = typeof lastMessage.content === "string" ? lastMessage.content : JSON.stringify(lastMessage.content);

      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.issues)) {
          return parsed.issues.map((issue: Partial<Issue>) => ({
            ...issue,
            agent: this.name,
          })) as Issue[];
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Generate a summary of found issues
   */
  protected generateSummary(issues: Issue[]): string {
    if (issues.length === 0) {
      return `${this.name} completed analysis. No issues found.`;
    }

    const bySeverity = issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const parts = Object.entries(bySeverity).map(([sev, count]) => `${count} ${sev}`);
    return `${this.name} found ${issues.length} issues: ${parts.join(", ")}`;
  }

  getName(): string { return this.name; }
  getPriority(): number { return this.priority; }
}

