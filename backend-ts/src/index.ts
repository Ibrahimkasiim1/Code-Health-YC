import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { getConfig } from "./config.js";
import authRoutes from "./routes/auth.js";
import repoRoutes from "./routes/repositories.js";
import issueRoutes from "./routes/issues.js";
import agentRoutes from "./routes/agents.js";
import webhookRoutes from "./routes/webhooks.js";
import chatbotRoutes from "./routes/chatbot.js";

const config = getConfig();
const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [config.FRONTEND_URL, "http://localhost:5173"],
    credentials: true,
  })
);

app.get("/", (c) => c.json({ message: "Code Health Platform API", version: "1.0.0" }));
app.get("/health", (c) => c.json({ status: "healthy" }));

app.route("/auth", authRoutes);
app.route("/repositories", repoRoutes);
app.route("/issues", issueRoutes);
app.route("/agents", agentRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/chatbot", chatbotRoutes);

serve({ fetch: app.fetch, port: config.PORT });

console.log(`Backend running on http://localhost:${config.PORT}`);
