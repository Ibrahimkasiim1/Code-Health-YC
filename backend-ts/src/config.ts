import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_ALGORITHM: z.string().default("HS256"),
  JWT_EXPIRATION_HOURS: z.coerce.number().default(24),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  GITHUB_WEBHOOK_SECRET: z.string().optional().default(""),
  MCP_BASE_URL: z.string().optional().default(""),
  PORT: z.coerce.number().default(8000),
  // LangSmith configuration
  LANGCHAIN_TRACING_V2: z.string().optional().default("true"),
  LANGCHAIN_ENDPOINT: z.string().optional().default("https://api.smith.langchain.com"),
  LANGCHAIN_API_KEY: z.string().optional().default(""),
  LANGCHAIN_PROJECT: z.string().optional().default("code-health-platform"),
});

export type Env = z.infer<typeof envSchema>;

let config: Env | null = null;

export function getConfig(): Env {
  if (config) return config;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  config = parsed.data;
  return config;
}

export function getGitHubOAuthConfig() {
  const cfg = getConfig();
  return {
    clientId: cfg.GITHUB_CLIENT_ID,
    clientSecret: cfg.GITHUB_CLIENT_SECRET,
    redirectUri: `${cfg.FRONTEND_URL}/auth/github/callback`,
  };
}
