import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getConfig } from "../../config.js";

const getModel = () => new ChatGoogleGenerativeAI({ apiKey: getConfig().GEMINI_API_KEY, model: "gemini-1.5-flash-latest" });

/**
 * Use LLM to analyze code for specific issue types
 */
export const llmAnalyzeCode = tool(
  async (input) => {
    try {
      const model = getModel();
      const prompt = `Analyze the following code for ${input.analysis_type} issues.

Code:
\`\`\`
${input.code}
\`\`\`

Context: ${input.context || "No additional context provided"}

Provide your analysis in JSON format with the following structure:
{
  "issues": [
    {
      "type": "${input.analysis_type}",
      "severity": "critical|high|medium|low",
      "title": "Brief title",
      "description": "Detailed description",
      "line_start": number,
      "line_end": number,
      "code_snippet": "relevant code",
      "confidence": 0.0-1.0
    }
  ],
  "summary": "Overall assessment"
}

Only return valid JSON, no markdown.`;

      const response = await model.invoke(prompt);
      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

      try {
        const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim());
        return JSON.stringify(parsed);
      } catch {
        return JSON.stringify({ issues: [], summary: content, raw: true });
      }
    } catch (error) {
      return JSON.stringify({ error: `Analysis failed: ${error}` });
    }
  },
  {
    name: "llm_analyze_code",
    description: "Use LLM to analyze code for specific issue types (security, performance, etc.)",
    schema: z.object({
      code: z.string().describe("Code to analyze"),
      analysis_type: z.enum(["security", "performance", "error_handling", "database", "ux", "general"]).describe("Type of analysis"),
      context: z.string().optional().describe("Additional context about the code"),
    }),
  }
);

/**
 * Use LLM to find root cause of an issue
 */
export const llmFindRootCause = tool(
  async (input) => {
    try {
      const model = getModel();
      const prompt = `Analyze the following issue and determine its root cause.

Issue: ${input.issue_description}

Code:
\`\`\`
${input.code}
\`\`\`

${input.error_logs ? `Error Logs:\n${input.error_logs}` : ""}

Provide your analysis in JSON format:
{
  "root_cause": "Clear explanation of the root cause",
  "contributing_factors": ["factor1", "factor2"],
  "evidence": "Specific code/log evidence supporting this conclusion",
  "confidence": 0.0-1.0
}

Only return valid JSON, no markdown.`;

      const response = await model.invoke(prompt);
      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

      try {
        return content.replace(/```json\n?|\n?```/g, "").trim();
      } catch {
        return JSON.stringify({ root_cause: content, confidence: 0.5 });
      }
    } catch (error) {
      return JSON.stringify({ error: `Root cause analysis failed: ${error}` });
    }
  },
  {
    name: "llm_find_root_cause",
    description: "Use LLM to determine the root cause of an identified issue.",
    schema: z.object({
      issue_description: z.string().describe("Description of the issue"),
      code: z.string().describe("Relevant code"),
      error_logs: z.string().optional().describe("Related error logs"),
    }),
  }
);

/**
 * Use LLM to suggest a fix for an issue
 */
export const llmSuggestFix = tool(
  async (input) => {
    try {
      const model = getModel();
      const prompt = `Suggest a fix for the following issue.

Issue: ${input.issue_description}
Root Cause: ${input.root_cause}

Original Code:
\`\`\`
${input.original_code}
\`\`\`

Provide your fix in JSON format:
{
  "fixed_code": "The complete fixed code",
  "explanation": "What was changed and why",
  "breaking_changes": ["any breaking changes"],
  "testing_suggestions": ["how to test the fix"],
  "confidence": 0.0-1.0
}

Only return valid JSON, no markdown.`;

      const response = await model.invoke(prompt);
      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

      try {
        return content.replace(/```json\n?|\n?```/g, "").trim();
      } catch {
        return JSON.stringify({ fixed_code: "", explanation: content, confidence: 0.5 });
      }
    } catch (error) {
      return JSON.stringify({ error: `Fix suggestion failed: ${error}` });
    }
  },
  {
    name: "llm_suggest_fix",
    description: "Use LLM to suggest a code fix for an identified issue.",
    schema: z.object({
      issue_description: z.string().describe("Description of the issue"),
      root_cause: z.string().describe("Root cause of the issue"),
      original_code: z.string().describe("Original code to fix"),
    }),
  }
);

export const llmTools = [llmAnalyzeCode, llmFindRootCause, llmSuggestFix];

