import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getSupabase } from "../db.js";
import {
  signupSchema,
  loginSchema,
  githubCallbackSchema,
} from "../types/index.js";
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  authMiddleware,
  getCurrentUser,
} from "../middleware/auth.js";
import {
  getGitHubAuthUrl,
  exchangeCodeForToken,
  getGitHubUser,
  saveGitHubInstallation,
} from "../services/github.js";

const auth = new Hono();

auth.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ detail: "Invalid signup payload" }, 400);
  }

  const { email, password } = parsed.data;
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email);

  if (existing && existing.length > 0) {
    return c.json({ detail: "Email already registered" }, 400);
  }

  const passwordHash = hashPassword(password);
  const { data: user, error } = await supabase
    .from("users")
    .insert({ email, password_hash: passwordHash })
    .select()
    .single();

  if (error || !user) {
    return c.json({ detail: "Failed to create user" }, 500);
  }

  const accessToken = createAccessToken(user.id);
  return c.json({
    access_token: accessToken,
    token_type: "bearer",
    user: { id: user.id, email: user.email },
  });
});

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ detail: "Invalid login payload" }, 400);
  }

  const { email, password } = parsed.data;
  const supabase = getSupabase();

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !user) {
    return c.json({ detail: "Invalid email or password" }, 401);
  }

  if (!verifyPassword(password, user.password_hash)) {
    return c.json({ detail: "Invalid email or password" }, 401);
  }

  const accessToken = createAccessToken(user.id);
  return c.json({
    access_token: accessToken,
    token_type: "bearer",
    user: { id: user.id, email: user.email },
  });
});

auth.get("/me", authMiddleware, (c) => {
  const user = getCurrentUser(c);
  return c.json({
    id: user.id,
    email: user.email,
    created_at: user.created_at,
  });
});

auth.get("/github/authorize", async (c) => {
  const state = randomUUID();
  const authUrl = getGitHubAuthUrl(state);
  return c.json({ authorization_url: authUrl, auth_url: authUrl, state });
});

auth.post("/github/callback", authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = githubCallbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ detail: "Invalid callback payload" }, 400);
  }

  const { code } = parsed.data;
  const user = getCurrentUser(c);

  const tokenData = await exchangeCodeForToken(code);
  if (!tokenData?.access_token) {
    return c.json({ detail: "Failed to exchange code for token" }, 400);
  }

  const githubUser = await getGitHubUser(tokenData.access_token);
  if (!githubUser) {
    return c.json({ detail: "Failed to get GitHub user info" }, 400);
  }

  const installation = await saveGitHubInstallation({
    userId: user.id,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    installationId: null,
  });

  if (!installation) {
    return c.json({ detail: "Failed to save GitHub installation" }, 500);
  }

  return c.json({
    success: true,
    github_user: {
      login: githubUser.login,
      avatar_url: githubUser.avatar_url,
    },
    installation_id: installation.id,
  });
});

auth.get("/github/status", authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const supabase = getSupabase();

  const { data } = await supabase
    .from("github_installations")
    .select("id, created_at, installation_id")
    .eq("user_id", user.id);

  return c.json({
    connected: !!data && data.length > 0,
    installation: data && data.length > 0 ? data[0] : null,
  });
});

export default auth;
