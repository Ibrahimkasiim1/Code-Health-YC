// Main entry point for LangChain-based agent system

// Export schemas
export * from "./schemas/issue.js";

// Export tools
export * from "./tools/index.js";

// Export agents
export * from "./agents/index.js";

// Export orchestrator
export { AgentOrchestrator, orchestrator } from "./orchestrator.js";
export type { OrchestrationResult } from "./orchestrator.js";

// LangSmith configuration helper
export function configureLangSmith() {
  // LangSmith is configured via environment variables:
  // - LANGCHAIN_TRACING_V2=true
  // - LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
  // - LANGCHAIN_API_KEY=your-api-key
  // - LANGCHAIN_PROJECT=code-health-platform

  const isEnabled = process.env.LANGCHAIN_TRACING_V2 === "true";
  const hasApiKey = !!process.env.LANGCHAIN_API_KEY;

  if (isEnabled && hasApiKey) {
    console.log("[LangSmith] Tracing enabled for project:", process.env.LANGCHAIN_PROJECT);
  } else if (isEnabled && !hasApiKey) {
    console.warn("[LangSmith] Tracing enabled but LANGCHAIN_API_KEY not set");
  }

  return { enabled: isEnabled, hasApiKey };
}

