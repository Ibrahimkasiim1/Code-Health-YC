import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "../config.js";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (genAI) return genAI;
  const config = getConfig();
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  return genAI;
}

export interface LLMMessage {
  role: "user" | "model";
  content: string;
}

// Invoke LLM with system and user prompts
export async function invokeLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      temperature: 0, // Deterministic responses
    },
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userPrompt);
  const response = result.response;
  return response.text();
}

// Generate structured JSON response
export async function invokeLLMForJSON<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T | null> {
  try {
    const response = await invokeLLM(
      systemPrompt + "\n\nIMPORTANT: Respond ONLY with valid JSON, no markdown code blocks.",
      userPrompt
    );

    // Clean up response (remove markdown if present)
    let cleaned = response.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }

    return JSON.parse(cleaned.trim()) as T;
  } catch {
    return null;
  }
}

// System prompts for different agents
export const SYSTEM_PROMPTS = {
  contextAnalysis: `You are an expert software architect analyzing a codebase.
Your task is to identify the technology stack from configuration files.

Analyze the provided files and extract:
- Programming languages used
- Frameworks (web, backend, testing)
- Databases and ORMs
- Third-party APIs and services
- Infrastructure tools

Respond with a JSON object in this format:
{
  "languages": ["string"],
  "frameworks": ["string"],
  "databases": ["string"],
  "apis": ["string"],
  "infrastructure": ["string"]
}`,

  costAnalysis: `You are an expert at analyzing code for API cost optimization.
Analyze the provided code and identify the root cause of high API costs.

Possible root causes:
- missing_cache: No caching of expensive API responses
- no_batching: Not batching multiple requests
- redundant_calls: Same API called multiple times unnecessarily
- inefficient_prompts: Overly long or complex prompts
- other: Other issues

Respond with a JSON object:
{
  "root_cause": "one of the above",
  "explanation": "detailed explanation",
  "suggested_fix": "high-level fix description",
  "confidence": 0.0 to 1.0
}`,

  fixGeneration: `You are an expert software engineer specializing in code optimization.

When generating fixes:
1. Preserve existing code style and patterns
2. Add proper error handling
3. Include clear comments explaining changes
4. Ensure production-ready code
5. Minimize changes - only fix the specific issue

For caching:
- Use appropriate cache TTL based on data volatility
- Include cache invalidation logic
- Handle cache misses gracefully
- Add logging for cache hits/misses

Return ONLY the complete fixed code, no explanations or markdown.`,

  fixExplanation: `You are a technical writer explaining code changes.
Given the original code and fixed code, write a clear explanation of:
1. What was changed
2. Why it was changed
3. Expected impact (performance, cost savings, etc.)

Keep the explanation concise (2-3 paragraphs).`,
};
