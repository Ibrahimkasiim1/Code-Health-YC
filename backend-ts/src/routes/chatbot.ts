import { Hono } from "hono";
import { getSupabase } from "../db.js";
import { authMiddleware, getCurrentUser } from "../middleware/auth.js";
import { ChatOpenAI } from "@langchain/openai";
import { getConfig } from "../config.js";

const chatbot = new Hono();

chatbot.use("*", authMiddleware);

interface ChatMessage {
    message: string;
    issue_id?: string;
}

chatbot.post("/message", async (c) => {
    const user = getCurrentUser(c);
    const body = await c.req.json().catch(() => null);

    if (!body || !body.message) {
        return c.json({ detail: "Message is required" }, 400);
    }

    const { message, issue_id } = body as ChatMessage;
    const supabase = getSupabase();

    // Get user's issues for context
    const { data: installations } = await supabase
        .from("github_installations")
        .select("id")
        .eq("user_id", user.id);

    if (!installations || installations.length === 0) {
        return c.json({
            response: "You don't have any connected GitHub repositories yet. Please connect a repository first to start analyzing code issues.",
        });
    }

    const installationIds = installations.map((inst) => inst.id);
    const { data: repos } = await supabase
        .from("connected_repositories")
        .select("id, repo_full_name")
        .in("installation_id", installationIds);

    if (!repos || repos.length === 0) {
        return c.json({
            response: "You don't have any connected repositories. Please connect a repository to analyze.",
        });
    }

    const repoIds = repos.map((r) => r.id);

    // Get all issues
    const { data: issues } = await supabase
        .from("issues")
        .select("*")
        .in("repo_id", repoIds)
        .order("severity", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(50);

    // If issue_id is provided, get specific issue details
    let currentIssue = null;
    if (issue_id) {
        const { data: issueData } = await supabase
            .from("issues")
            .select("*")
            .eq("id", issue_id)
            .single();

        if (issueData) {
            currentIssue = issueData;
        }
    }

    // Build context for the AI
    const issuesSummary = issues?.map((issue) => ({
        id: issue.id,
        title: issue.title,
        severity: issue.severity,
        status: issue.status,
        type: issue.issue_type,
        agent: issue.agent_type,
        file_path: issue.file_path,
        description: issue.description,
    })) || [];

    const systemPrompt = `You are a helpful code health assistant. You help developers understand and fix code issues.

Context:
- User has ${issuesSummary.length} total issues across their repositories
- Issues range from security vulnerabilities to performance problems
${currentIssue ? `- Currently viewing issue: "${currentIssue.title}" (${currentIssue.severity} severity)` : ""}

Available issues:
${issuesSummary.slice(0, 10).map((i) => `- ${i.title} (${i.severity} - ${i.type})`).join("\n")}

When answering:
1. Be concise and helpful
2. Provide actionable advice
3. Reference specific issues when relevant
4. If asked about metrics or details not in context, say you don't have that information
5. Encourage users to click on issues to see more details and generate fixes`;

    const llm = new ChatOpenAI({
        apiKey: getConfig().OPENAI_API_KEY,
        model: "gpt-4o-mini",
        temperature: 0.7,
    });

    try {
        const response = await llm.invoke([
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: currentIssue
                    ? `Context: I'm looking at this issue:\nTitle: ${currentIssue.title}\nDescription: ${currentIssue.description}\nSeverity: ${currentIssue.severity}\nFile: ${currentIssue.file_path}\n\nQuestion: ${message}`
                    : message
            },
        ]);

        return c.json({
            response: response.content,
            context: {
                total_issues: issuesSummary.length,
                current_issue_id: issue_id || null,
            },
        });
    } catch (error) {
        console.error("Chatbot error:", error);
        return c.json(
            { detail: "Failed to generate response. Please try again." },
            500
        );
    }
});

export default chatbot;
