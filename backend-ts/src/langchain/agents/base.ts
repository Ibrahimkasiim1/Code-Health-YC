import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { StructuredTool } from "@langchain/core/tools";
import { getConfig } from "../../config.js";
import { AgentOutput, Issue } from "../schemas/issue.js";
import { EventEmitter } from "events";

// Fix MaxListenersExceededWarning by increasing the limit
EventEmitter.defaultMaxListeners = 20;

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
  protected model: ChatOpenAI;

  constructor(agentConfig: AgentConfig) {
    this.name = agentConfig.name;
    this.description = agentConfig.description;
    this.priority = agentConfig.priority;
    this.systemPrompt = agentConfig.systemPrompt;
    this.tools = agentConfig.tools;
    this.model = new ChatOpenAI({
      apiKey: getConfig().OPENAI_API_KEY,
      model: "gpt-4o-mini",
      temperature: 0.1,
    });
  }

  /**
   * Create the LangGraph ReAct agent
   */
  protected createAgent(): ReturnType<typeof createReactAgent> {
    return createReactAgent({
      llm: this.model,
      tools: this.tools,
      messageModifier: this.systemPrompt,
    });
  }

  /**
   * Get the recursion limit for this agent (can be overridden)
   */
  protected getRecursionLimit(): number {
    return 50; // headroom for more complex analysis
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
          repoId: context.repoId, // Add repoId to configurable context
        },
        recursionLimit: this.getRecursionLimit(), // Use configurable recursion limit
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
      console.error(`[${this.name}] Agent execution failed:`, error);
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
   * Improved JSON parsing with multiple fallback methods
   */
  protected parseIssues(result: { messages: Array<{ content: string | any }> }): Issue[] {
    try {
      const lastMessage = result.messages[result.messages.length - 1];
      const content = typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      let parsed: any;

      // Method 1: Direct JSON parse (for clean LLM responses)
      try {
        parsed = JSON.parse(content);
      } catch {
        // Method 2: Extract from markdown code blocks
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          try {
            parsed = JSON.parse(codeBlockMatch[1].trim());
          } catch {
            // Method 3: Find JSON object with better regex
            const jsonMatch = content.match(/\{[\s\S]*"issues"[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[0]);
              } catch {
                console.error(`[${this.name}] Failed all JSON parsing methods`);
                return [];
              }
            }
          }
        } else {
          // Method 3: Try direct regex match
          const jsonMatch = content.match(/\{[\s\S]*"issues"[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              console.error(`[${this.name}] Failed all JSON parsing methods`);
              return [];
            }
          }
        }
      }

      // Validate and normalize issues
      if (parsed && Array.isArray(parsed.issues)) {
        return parsed.issues.map((issue: Partial<Issue>, index: number) => {
          // Generate issue_id if missing
          const issueId = issue.issue_id || `${this.name.toLowerCase()}-${Date.now()}-${index}`;

          return {
            issue_id: issueId,
            agent: this.name,
            type: issue.type || "security_vulnerability",
            severity: issue.severity || "medium",
            title: issue.title || "Untitled Issue",
            description: issue.description || "",
            file_path: issue.file_path || "",
            line_start: issue.line_start || 0,
            line_end: issue.line_end || 0,
            code_snippet: issue.code_snippet || "",
            root_cause: issue.root_cause || "",
            impact: issue.impact || "",
            suggested_fix: issue.suggested_fix || "",
            confidence: issue.confidence || 0.5,
            metadata: issue.metadata || {},
          } as Issue;
        });
      }

      console.warn(`[${this.name}] Response didn't contain issues array`);
      return [];
    } catch (error) {
      console.error(`[${this.name}] Failed to parse issues:`, error);
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

