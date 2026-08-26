-- API Integrations Table for tracking external API/service usage
-- This is a Pro-only feature

CREATE TABLE IF NOT EXISTS api_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT,
  usage_current NUMERIC,
  usage_limit NUMERIC,
  usage_unit TEXT DEFAULT 'tokens',
  credits_remaining NUMERIC,
  credit_limit NUMERIC,
  billing_period TEXT,
  reset_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  currency TEXT DEFAULT 'USD',
  cost NUMERIC,
  status TEXT DEFAULT 'active',
  connection_type TEXT DEFAULT 'manual',
  encrypted_credentials TEXT,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service_name, provider)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_api_integrations_user_id ON api_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_api_integrations_provider ON api_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_api_integrations_status ON api_integrations(status);

-- Enable Row Level Security
ALTER TABLE api_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own integrations
CREATE POLICY "Users can view own API integrations"
  ON api_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API integrations"
  ON api_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API integrations"
  ON api_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own API integrations"
  ON api_integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER api_integrations_updated_at
  BEFORE UPDATE ON api_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_api_integrations_updated_at();
