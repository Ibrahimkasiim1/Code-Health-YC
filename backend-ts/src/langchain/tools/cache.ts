import { getSupabase } from "../../db.js";
import crypto from "crypto";

/**
 * GitHub API Cache Utility
 * Stores API responses in Supabase to reduce rate limiting
 */

const DEFAULT_TTL_HOURS = 24; // Cache for 24 hours by default

/**
 * Generate a cache key from the operation and parameters
 */
function generateCacheKey(operation: string, params: Record<string, any>): string {
  const normalized = JSON.stringify({ operation, ...params });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Get cached response if available and not expired
 */
export async function getCachedResponse<T>(
  operation: string,
  params: Record<string, any>
): Promise<T | null> {
  const cacheKey = generateCacheKey(operation, params);
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase
      .from('github_api_cache')
      .select('response, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) return null;

    // Check if expired
    const expiresAt = new Date(data.expires_at);
    if (expiresAt < new Date()) {
      // Expired - delete it
      await supabase.from('github_api_cache').delete().eq('cache_key', cacheKey);
      return null;
    }

    return data.response as T;
  } catch {
    return null;
  }
}

/**
 * Store response in cache
 */
export async function setCachedResponse(
  operation: string,
  params: Record<string, any>,
  response: any,
  ttlHours: number = DEFAULT_TTL_HOURS
): Promise<void> {
  const cacheKey = generateCacheKey(operation, params);
  const supabase = getSupabase();

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);

  try {
    await supabase.from('github_api_cache').upsert({
      cache_key: cacheKey,
      response,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[Cache] Failed to store cache:', error);
  }
}

/**
 * Clear all cache entries for a specific repository
 */
export async function clearRepoCache(owner: string, repo: string): Promise<void> {
  const supabase = getSupabase();
  
  try {
    // Delete all cache entries that contain this repo in the key
    const { data: entries } = await supabase
      .from('github_api_cache')
      .select('cache_key, response')
      .like('response', `%${owner}/${repo}%`);

    if (entries && entries.length > 0) {
      const keys = entries.map(e => e.cache_key);
      await supabase.from('github_api_cache').delete().in('cache_key', keys);
    }
  } catch (error) {
    console.error('[Cache] Failed to clear repo cache:', error);
  }
}

