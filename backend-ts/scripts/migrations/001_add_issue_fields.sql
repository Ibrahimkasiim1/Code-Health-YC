-- Migration: Add new fields to issues table for LangChain agent system
-- Run this migration against your Supabase database

-- Add new columns to issues table
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS line_start INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS line_end INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS code_snippet TEXT,
ADD COLUMN IF NOT EXISTS root_cause TEXT,
ADD COLUMN IF NOT EXISTS impact TEXT,
ADD COLUMN IF NOT EXISTS suggested_fix TEXT,
ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS agent VARCHAR(100);

-- Create repository_contexts table for Context Agent output
CREATE TABLE IF NOT EXISTS repository_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES connected_repositories(id) ON DELETE CASCADE,
  context_json JSONB NOT NULL DEFAULT '{}',
  stack_summary TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(repo_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_repository_contexts_repo_id ON repository_contexts(repo_id);
CREATE INDEX IF NOT EXISTS idx_issues_agent ON issues(agent);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);

-- Update fixes table to support new fix format
ALTER TABLE fixes
ADD COLUMN IF NOT EXISTS start_line INTEGER,
ADD COLUMN IF NOT EXISTS end_line INTEGER,
ADD COLUMN IF NOT EXISTS file_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS pr_title VARCHAR(500),
ADD COLUMN IF NOT EXISTS pr_body TEXT;

-- Create telemetry_events table if not exists (for telemetry tools)
CREATE TABLE IF NOT EXISTS telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint VARCHAR(500),
  event_type VARCHAR(100),
  duration_ms INTEGER,
  user_id UUID,
  request_hash VARCHAR(64),
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create session_events table if not exists (for UX agent)
CREATE TABLE IF NOT EXISTS session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  page_url VARCHAR(500),
  duration_ms INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create error_events table if not exists (for Error agent)
CREATE TABLE IF NOT EXISTS error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_message TEXT,
  stack_trace TEXT,
  endpoint VARCHAR(500),
  user_id UUID,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create brex_transactions table if not exists (for Business Intel agent)
CREATE TABLE IF NOT EXISTS brex_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  amount DECIMAL(12,2),
  merchant VARCHAR(500),
  detected_service VARCHAR(100),
  transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for telemetry tables
CREATE INDEX IF NOT EXISTS idx_telemetry_events_timestamp ON telemetry_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_endpoint ON telemetry_events(endpoint);
CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_timestamp ON session_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_error_events_timestamp ON error_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_brex_transactions_user_id ON brex_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_brex_transactions_date ON brex_transactions(transaction_date);

-- Enable RLS on new tables
ALTER TABLE repository_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE brex_transactions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE repository_contexts IS 'Stores cached repository analysis from Context Agent';
COMMENT ON TABLE telemetry_events IS 'Stores API telemetry data for performance analysis';
COMMENT ON TABLE session_events IS 'Stores user session data for UX analysis';
COMMENT ON TABLE error_events IS 'Stores error events for Error Agent analysis';
COMMENT ON TABLE brex_transactions IS 'Stores Brex transaction data for cost analysis';

