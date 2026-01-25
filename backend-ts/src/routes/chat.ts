import { Hono } from "hono";
import OpenAI from "openai";
import { getConfig } from "../config.js";
import { authMiddleware, getCurrentUser } from "../middleware/auth.js";
import { getSupabase } from "../db.js";

const chat = new Hono();

chat.use("*", authMiddleware);

// Initialize OpenAI client
function getOpenAI() {
  const config = getConfig();
  return new OpenAI({
    apiKey: config.OPENAI_API_KEY,
  });
}

// System prompt for the Code Health assistant
const SYSTEM_PROMPT = `You are an expert Code Health Assistant that helps developers understand and fix issues in their codebase.

You have FULL ACCESS to all detected issues in the user's codebase. Use this information to:
- Answer specific questions about any issue by number or title
- Explain what each issue means and why it's a problem
- Provide detailed fixes with code examples
- Prioritize which issues to fix first
- Compare issues and identify patterns
- Summarize the overall health of the codebase

When responding:
- Be specific and reference actual issues from the context
- For code fixes, provide complete, copy-paste ready solutions
- Explain the impact of each issue
- Be concise but thorough
- If asked about a specific issue, quote its details from the context

IMPORTANT: You have access to ALL issue details including titles, descriptions, file paths, code snippets, root causes, and suggested fixes. Use this data to give accurate, specific answers.`;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

chat.post("/", async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);

  if (!body || !body.message) {
    return c.json({ detail: "Message is required" }, 400);
  }

  const { message, history = [] } = body;

  try {
    const openai = getOpenAI();
    const supabase = getSupabase();

    // Get ALL issues from database for full context
    const { data: allRepos } = await supabase
      .from("connected_repositories")
      .select("id, repo_full_name");

    const repoMap = new Map((allRepos || []).map((r) => [r.id, r.repo_full_name]));

    // Fetch ALL issues with full details
    const { data: issues } = await supabase
      .from("issues")
      .select("*")
      .order("severity", { ascending: true })
      .order("created_at", { ascending: false });

    let issuesContext = "";

    if (issues && issues.length > 0) {
      // Sort by severity priority
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const sortedIssues = issues.sort((a, b) => 
        (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4)
      );

      issuesContext = `\n\n=== ALL DETECTED ISSUES IN THE CODEBASE (${issues.length} total) ===\n\n${sortedIssues
        .map((issue, idx) => {
          const repoName = repoMap.get(issue.repo_id) || "unknown repo";
          return `ISSUE #${idx + 1}:
- Title: ${issue.title}
- Severity: ${issue.severity.toUpperCase()}
- Type: ${issue.issue_type || "general"}
- Status: ${issue.status}
- Repository: ${repoName}
- File: ${issue.file_path || "N/A"}
- Line Range: ${issue.line_start ? `${issue.line_start}-${issue.line_end}` : "N/A"}
- Description: ${issue.description || "No description"}
- Root Cause: ${issue.root_cause || "Not analyzed"}
- Impact: ${issue.impact || "Not specified"}
- Suggested Fix: ${issue.suggested_fix || "Not available"}
- Confidence: ${issue.confidence ? `${(issue.confidence * 100).toFixed(0)}%` : "N/A"}
- Code Snippet: ${issue.code_snippet ? `\n\`\`\`\n${issue.code_snippet}\n\`\`\`` : "N/A"}`;
        })
        .join("\n\n---\n\n")}`;

      // Add summary stats
      const criticalCount = issues.filter(i => i.severity === "critical").length;
      const highCount = issues.filter(i => i.severity === "high").length;
      const mediumCount = issues.filter(i => i.severity === "medium").length;
      const lowCount = issues.filter(i => i.severity === "low").length;

      issuesContext = `\n\n=== ISSUES SUMMARY ===
Total Issues: ${issues.length}
- Critical: ${criticalCount}
- High: ${highCount}
- Medium: ${mediumCount}
- Low: ${lowCount}
${issuesContext}`;
    } else {
      issuesContext = "\n\nNo issues have been detected in the codebase yet. The user may need to run an analysis first.";
    }

    // Build messages array
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT + issuesContext,
      },
      ...history.slice(-10).map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      {
        role: "user",
        content: message,
      },
    ];

    console.log(`[Chat] Processing message for user ${user.id}: "${message.substring(0, 50)}..."`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || "I apologize, but I couldn't generate a response. Please try again.";

    console.log(`[Chat] Response generated successfully`);

    return c.json({
      response,
      usage: completion.usage,
    });
  } catch (error) {
    console.error("[Chat] Error:", error);
    
    if (error instanceof OpenAI.APIError) {
      return c.json({ detail: `OpenAI API error: ${error.message}` }, 500);
    }
    
    return c.json({ detail: "Failed to process chat message" }, 500);
  }
});

export default chat;
