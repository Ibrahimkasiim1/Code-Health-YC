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

// GitHub login - creates user if doesn't exist, returns JWT
auth.post("/github/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = githubCallbackSchema.safeParse(body);
  if (!parsed.success) {
    console.error("GitHub login validation failed:", parsed.error);
    return c.json({ detail: "Invalid login payload" }, 400);
  }

  const { code } = parsed.data;
  console.log("Processing GitHub login...");

  // Exchange code for access token
  const tokenData = await exchangeCodeForToken(code);
  if (!tokenData?.access_token) {
    console.error("Failed to exchange code for token");
    return c.json({ detail: "Failed to exchange code for token" }, 400);
  }
  console.log("Successfully exchanged code for access token");

  // Get GitHub user info
  const githubUser = await getGitHubUser(tokenData.access_token);
  if (!githubUser) {
    console.error("Failed to get GitHub user info");
    return c.json({ detail: "Failed to get GitHub user info" }, 400);
  }
  console.log(`GitHub user authenticated: ${githubUser.login}`);

  const supabase = getSupabase();
  
  // Use GitHub email or create a placeholder email
  const email = githubUser.email || `${githubUser.login}@github.local`;
  
  // Check if user exists with this email
  let { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  // If no user found, create one
  if (!user) {
    console.log(`Creating new user for GitHub user: ${githubUser.login}`);
    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        email,
        password_hash: `github:${githubUser.id}`, // Mark as GitHub-authenticated user
      })
      .select()
      .single();

    if (error || !newUser) {
      console.error("Failed to create user:", error);
      return c.json({ detail: "Failed to create user account" }, 500);
    }
    user = newUser;
  }

  // Save GitHub installation for this user
  const installation = await saveGitHubInstallation({
    userId: user.id,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    installationId: null,
  });

  if (!installation) {
    console.error("Failed to save GitHub installation to database");
    return c.json({ detail: "Failed to save GitHub installation" }, 500);
  }
  console.log(`GitHub installation saved with ID: ${installation.id}`);

  // Create JWT token
  const accessToken = createAccessToken(user.id);

  return c.json({
    access_token: accessToken,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      github_login: githubUser.login,
      avatar_url: githubUser.avatar_url,
    },
  });
});

// Legacy callback for users already logged in (connecting GitHub to existing account)
auth.post("/github/callback", authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = githubCallbackSchema.safeParse(body);
  if (!parsed.success) {
    console.error("GitHub callback validation failed:", parsed.error);
    return c.json({ detail: "Invalid callback payload" }, 400);
  }

  const { code } = parsed.data;
  const user = getCurrentUser(c);
  console.log(`Processing GitHub callback for user ${user.id}`);

  const tokenData = await exchangeCodeForToken(code);
  if (!tokenData?.access_token) {
    console.error("Failed to exchange code for token");
    return c.json({ detail: "Failed to exchange code for token" }, 400);
  }
  console.log("Successfully exchanged code for access token");

  const githubUser = await getGitHubUser(tokenData.access_token);
  if (!githubUser) {
    console.error("Failed to get GitHub user info");
    return c.json({ detail: "Failed to get GitHub user info" }, 400);
  }
  console.log(`GitHub user authenticated: ${githubUser.login}`);

  const installation = await saveGitHubInstallation({
    userId: user.id,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    installationId: null,
  });

  if (!installation) {
    console.error("Failed to save GitHub installation to database");
    return c.json({ detail: "Failed to save GitHub installation" }, 500);
  }
  console.log(`GitHub installation saved with ID: ${installation.id}`);

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

  const { data, error } = await supabase
    .from("github_installations")
    .select("id, created_at, installation_id, access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error checking GitHub status:", error);
  }

  // Check if installation exists AND has a valid access token
  const isConnected = !!data && !!data.access_token_encrypted;

  return c.json({
    connected: isConnected,
    installation: isConnected ? {
      id: data.id,
      created_at: data.created_at,
      installation_id: data.installation_id,
    } : null,
  });
});

export default auth;
