from supabase import create_client, Client
from .config import get_settings

_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_key
        )
    return _supabase_client


# Database schema for reference (create in Supabase dashboard):
"""
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GitHub installations
CREATE TABLE github_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    installation_id BIGINT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connected repositories
CREATE TABLE connected_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID REFERENCES github_installations(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,
    default_branch TEXT DEFAULT 'main',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(installation_id, repo_full_name)
);

-- Repository contexts (tech stack, architecture info)
CREATE TABLE repository_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID REFERENCES connected_repositories(id) ON DELETE CASCADE,
    context_json JSONB,
    stack_summary TEXT,
    analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brex transactions (mock data for demo)
CREATE TABLE brex_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    merchant TEXT NOT NULL,
    detected_service TEXT,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issues detected by agents
CREATE TABLE issues (
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
CREATE TABLE fixes (
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
CREATE TABLE pull_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fix_id UUID REFERENCES fixes(id) ON DELETE CASCADE,
    repo_id UUID REFERENCES connected_repositories(id) ON DELETE CASCADE,
    pr_number INTEGER,
    pr_url TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'merged', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""
