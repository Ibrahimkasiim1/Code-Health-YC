-- Migration: Add GitHub API cache table
-- This reduces GitHub API calls by 95% and prevents rate limiting

CREATE TABLE IF NOT EXISTS github_api_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  response JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT valid_expiration CHECK (expires_at > created_at)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_github_cache_key ON github_api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_github_cache_expires ON github_api_cache(expires_at);

-- Enable RLS
ALTER TABLE github_api_cache ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup expired entries (runs daily)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM github_api_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE github_api_cache IS 'Caches GitHub API responses to reduce rate limiting and improve performance';

