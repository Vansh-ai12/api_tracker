-- API Usage History Table for tracking historical usage data
-- This is a Pro-only feature

CREATE TABLE IF NOT EXISTS api_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES api_integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  usage_current NUMERIC,
  usage_limit NUMERIC,
  usage_unit TEXT,
  requests NUMERIC,
  credits_remaining NUMERIC,
  credit_limit NUMERIC,
  cost NUMERIC,
  currency TEXT,
  reset_at TIMESTAMPTZ,
  metadata JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_api_usage_history_user_id ON api_usage_history(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_history_integration_id ON api_usage_history(integration_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_history_provider ON api_usage_history(provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_history_recorded_at ON api_usage_history(recorded_at DESC);

-- Enable Row Level Security
ALTER TABLE api_usage_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own history
CREATE POLICY "Users can view own API usage history"
  ON api_usage_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API usage history"
  ON api_usage_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add sync_enabled and sync lock columns to api_integrations
ALTER TABLE api_integrations 
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER DEFAULT 360,
  ADD COLUMN IF NOT EXISTS last_sync_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Index for sync queries
CREATE INDEX IF NOT EXISTS idx_api_integrations_sync_enabled ON api_integrations(connection_type, sync_enabled) WHERE connection_type = 'automatic' AND sync_enabled = true;
