# Code Health

A platform that connects to your GitHub repositories, runs a team of AI agents over the code and its production telemetry, and turns what they find into reviewable fixes and pull requests. Built at a Y Combinator hackathon in January 2026.

<!-- Add a screenshot or demo GIF here, e.g. ![demo](docs/demo.gif) -->

## Features

- Connect GitHub repositories through OAuth and analyze them on demand or from webhooks
- Parallel analysis agents for **security**, **performance**, **errors**, **database**, **UX**, and **cost**, with every issue ranked by severity
- One-click fix generation with a side-by-side diff viewer, then open the fix as a pull request
- Cost analysis that compares API spending against real usage telemetry to flag overspending and caching opportunities
- A chat assistant and an MCP server, so you can query spending and repository context from an AI client

## How it works

```
GitHub repo ──OAuth/webhooks──▶ Hono API ──▶ Orchestrator
                                               ├─ Context agent (runs first)
Telemetry SDK ──events──▶ Supabase ◀──────────▶├─ Security / Performance / Error
                             ▲                 ├─ Database / UX / Business intel
                             │                 └─ Fix agent ──▶ diff ──▶ GitHub PR
React dashboard ◀────────────┘
```

1. A **context agent** maps the repository (stack, structure, key files) and caches the result.
2. The **analysis agents** run in parallel with that context. Each is a LangChain agent with tools for reading code from GitHub, querying telemetry and spending data in Supabase, and calling the LLM.
3. Issues are normalized into one schema and stored in Supabase. The dashboard groups them by severity, type and agent.
4. The **fix agent** generates a patch for a chosen issue. The user reviews the diff and the backend opens a pull request through the GitHub API.
5. A lightweight **telemetry SDK** (`backend-ts/public/`) lets apps send usage and error events that the agents use as evidence.

## Tech stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Monaco diff editor
- **Backend:** Node.js, Hono, TypeScript, Zod
- **Agents:** LangChain / LangGraph, OpenAI, Google Gemini, LangSmith tracing
- **Database and auth:** Supabase (Postgres), JWT, GitHub OAuth
- **Integrations:** GitHub API (Octokit), Model Context Protocol server

## Results

<!-- Add the hackathon outcome or any numbers here -->

## Running it locally

1. Clone and install each package:
   ```bash
   git clone https://github.com/Ibrahimkasiim1/Code-Health-YC.git
   cd Code-Health-YC
   (cd backend-ts && npm install)
   (cd frontend && npm install)
   (cd mcp-server && npm install)   # optional
   ```
2. Create a Supabase project and run `supabase_complete_schema.sql` in its SQL editor.
3. Create a GitHub OAuth app with the callback URL `http://localhost:5173/auth/github/callback`.
4. Copy the env templates and fill them in:
   ```bash
   cp backend-ts/.env.example backend-ts/.env
   cp frontend/.env.example frontend/.env
   cp mcp-server/.env.example mcp-server/.env   # optional
   ```
5. Start the backend (port 8000) and the frontend (port 5173):
   ```bash
   (cd backend-ts && npm run dev)
   (cd frontend && npm run dev)
   ```

## Team

- [Ibrahim Kasim](https://github.com/Ibrahimkasiim1): backend, agent system, GitHub integration
- [Rag Patel](https://github.com/rag-pat): MCP server, frontend
<!-- Adjust roles if needed -->

The `mcp` branch has the full MCP server with Claude Desktop setup, and `frontend` has the demo UI.
