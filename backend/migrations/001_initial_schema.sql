-- Code Health Platform - Initial Schema
-- Run this migration in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GitHub installations
CREATE TABLE IF NOT EXISTS github_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    installation_id BIGINT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connected repositories
CREATE TABLE IF NOT EXISTS connected_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID REFERENCES github_installations(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,
    default_branch TEXT DEFAULT 'main',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(installation_id, repo_full_name)
);

-- Repository contexts (tech stack, architecture info)
CREATE TABLE IF NOT EXISTS repository_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID REFERENCES connected_repositories(id) ON DELETE CASCADE,
    context_json JSONB,
    stack_summary TEXT,
    analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brex transactions (mock data for demo)
CREATE TABLE IF NOT EXISTS brex_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    merchant TEXT NOT NULL,
    detected_service TEXT,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issues detected by agents
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID REFERENCES connected_repositories(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
    metrics JSONB,
    file_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated fixes
CREATE TABLE IF NOT EXISTS fixes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    original_code TEXT,
    fixed_code TEXT,
    diff TEXT,
    confidence_score DECIMAL(3, 2),
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pull requests created
CREATE TABLE IF NOT EXISTS pull_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fix_id UUID REFERENCES fixes(id) ON DELETE CASCADE,
    repo_id UUID REFERENCES connected_repositories(id) ON DELETE CASCADE,
    pr_number INTEGER,
    pr_url TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'merged', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_github_installations_user_id ON github_installations(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_repositories_installation_id ON connected_repositories(installation_id);
CREATE INDEX IF NOT EXISTS idx_repository_contexts_repo_id ON repository_contexts(repo_id);
CREATE INDEX IF NOT EXISTS idx_brex_transactions_user_id ON brex_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_brex_transactions_date ON brex_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_issues_repo_id ON issues(repo_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_fixes_issue_id ON fixes(issue_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_fix_id ON pull_requests(fix_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repo_id ON pull_requests(repo_id);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE repository_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brex_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pull_requests ENABLE ROW LEVEL SECURITY;

-- Note: For the service role key used by the backend, RLS is bypassed.
-- Add appropriate policies if you need direct client access.
