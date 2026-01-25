// Export all LangChain tools
export { githubTools, githubSearchCode, githubGetFile, githubListDirectory, githubSearchPattern } from "./github.js";
export { telemetryTools, queryTelemetryEvents, calculateLatencyPercentiles, getSessionFlows, getErrorEvents, detectDuplicateRequests } from "./telemetry.js";
export { databaseTools, getBrexSpending, getRepositoryContext, getExistingIssues, calculateUnitEconomics } from "./database.js";
export { codeAnalysisTools, parseDependencies, parseCodeAst, detectOrmPatterns, extractApiEndpoints } from "./codeAnalysis.js";
export { externalTools, checkCveDatabase, validateSyntax } from "./external.js";
export { llmTools, llmAnalyzeCode, llmFindRootCause, llmSuggestFix } from "./llm.js";

// Combined tool collections by agent type
import { githubTools } from "./github.js";
import { telemetryTools } from "./telemetry.js";
import { databaseTools } from "./database.js";
import { codeAnalysisTools } from "./codeAnalysis.js";
import { externalTools } from "./external.js";
import { llmTools } from "./llm.js";

export const contextAgentTools = [...githubTools, ...codeAnalysisTools];
export const securityAgentTools = [...githubTools, ...codeAnalysisTools, ...externalTools, ...llmTools];
export const businessIntelAgentTools = [...databaseTools, ...telemetryTools, ...llmTools];
export const errorAgentTools = [...telemetryTools, ...githubTools, ...llmTools];
export const performanceAgentTools = [...telemetryTools, ...githubTools, ...codeAnalysisTools, ...llmTools];
export const databaseAgentTools = [...githubTools, ...codeAnalysisTools, ...llmTools];
export const uxAgentTools = [...telemetryTools, ...llmTools];
export const fixAgentTools = [...githubTools, ...llmTools];

export const allTools = [...githubTools, ...telemetryTools, ...databaseTools, ...codeAnalysisTools, ...externalTools, ...llmTools];

