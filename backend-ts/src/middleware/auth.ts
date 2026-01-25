import { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getConfig } from "../config.js";
import { getSupabase, User } from "../db.js";

interface JWTPayload {
  sub: string;
  exp: number;
}

// Password utilities
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

// JWT utilities
export function createAccessToken(userId: string): string {
  const config = getConfig();
  const expiresIn = config.JWT_EXPIRATION_HOURS * 60 * 60; // Convert to seconds

  return jwt.sign({ sub: userId }, config.JWT_SECRET, {
    expiresIn,
    algorithm: "HS256",
  });
}

export function decodeAccessToken(token: string): JWTPayload | null {
  const config = getConfig();

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JWTPayload;
    return decoded;
  } catch {
    return null;
  }
}

// Get user from database
export async function getUserById(userId: string): Promise<User | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data as User;
}

// Auth middleware
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ detail: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.substring(7);
  const payload = decodeAccessToken(token);

  if (!payload) {
    return c.json({ detail: "Invalid or expired token" }, 401);
  }

  const user = await getUserById(payload.sub);

  if (!user) {
    return c.json({ detail: "User not found" }, 401);
  }

  // Set user in context for downstream handlers
  c.set("user", user);
  c.set("userId", user.id);

  await next();
}

// Get current user from context (to be used after authMiddleware)
export function getCurrentUser(c: Context): User {
  return c.get("user") as User;
}

export function getCurrentUserId(c: Context): string {
  return c.get("userId") as string;
}
