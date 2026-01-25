// Export all agents
export { BaseAgent } from "./base.js";
export type { AgentConfig, AgentContext } from "./base.js";
export { ContextAgent, contextAgent } from "./context.js";
export { SecurityAgent, securityAgent } from "./security.js";
export { BusinessIntelAgent, businessIntelAgent } from "./businessIntel.js";
export { ErrorAgent, errorAgent } from "./error.js";
export { PerformanceAgent, performanceAgent } from "./performance.js";
export { DatabaseAgent, databaseAgent } from "./database.js";
export { UXAgent, uxAgent } from "./ux.js";
export { FixAgent, fixAgent } from "./fix.js";
export type { FixResult } from "./fix.js";

// Analysis agents sorted by priority (highest first)
import { securityAgent } from "./security.js";
import { businessIntelAgent } from "./businessIntel.js";
import { errorAgent } from "./error.js";
import { performanceAgent } from "./performance.js";
import { databaseAgent } from "./database.js";
import { uxAgent } from "./ux.js";

export const analysisAgents = [
  securityAgent,      // Priority 9
  businessIntelAgent, // Priority 8
  errorAgent,         // Priority 7
  performanceAgent,   // Priority 6
  databaseAgent,      // Priority 5
  uxAgent,            // Priority 4
];

