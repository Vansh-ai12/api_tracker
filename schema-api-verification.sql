-- Add verification fields to api_integrations table
ALTER TABLE api_integrations 
  ADD COLUMN IF NOT EXISTS verification_status TEXT,
  ADD COLUMN IF NOT EXISTS verification_provider_total NUMERIC,
  ADD COLUMN IF NOT EXISTS verification_calculated_total NUMERIC,
  ADD COLUMN IF NOT EXISTS verification_difference NUMERIC,
  ADD COLUMN IF NOT EXISTS verification_difference_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS verification_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_reason TEXT,
  ADD COLUMN IF NOT EXISTS verification_tolerance NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS balance NUMERIC,
  ADD COLUMN IF NOT EXISTS balance_currency TEXT,
  ADD COLUMN IF NOT EXISTS balance_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_identifier TEXT;

-- Create api_verification_history table for historical verification snapshots
CREATE TABLE IF NOT EXISTS api_verification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES api_integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  
  -- Verification results
  verification_status TEXT NOT NULL,
  verification_provider_total NUMERIC,
  verification_calculated_total NUMERIC,
  verification_difference NUMERIC,
  verification_difference_percentage NUMERIC,
  verification_reason TEXT,
  verification_tolerance NUMERIC,
  
  -- Usage snapshot at time of verification
  usage_current NUMERIC,
  usage_limit NUMERIC,
  usage_unit TEXT,
  input_tokens NUMERIC,
  output_tokens NUMERIC,
  cached_tokens NUMERIC,
  requests NUMERIC,
  cost NUMERIC,
  currency TEXT,
  
  -- Balance snapshot
  balance NUMERIC,
  balance_currency TEXT,
  
  -- Raw provider response (sanitized)
  raw_provider_response JSONB,
  
  -- Metadata
  account_identifier TEXT,
  metadata JSONB,
  
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_api_verification_history_integration_id ON api_verification_history(integration_id);
CREATE INDEX IF NOT EXISTS idx_api_verification_history_user_id ON api_verification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_api_verification_history_provider ON api_verification_history(provider);
CREATE INDEX IF NOT EXISTS idx_api_verification_history_verified_at ON api_verification_history(verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_verification_history_status ON api_verification_history(verification_status);

-- Enable Row Level Security
ALTER TABLE api_verification_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own verification history
CREATE POLICY "Users can view own API verification history"
  ON api_verification_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API verification history"
  ON api_verification_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
