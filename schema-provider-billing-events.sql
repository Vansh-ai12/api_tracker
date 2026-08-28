-- Provider Billing Events Table
-- Stores billing/usage signals extracted from Gmail emails
-- This is separate from API usage snapshots - email is a secondary billing signal

CREATE TABLE IF NOT EXISTS provider_billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'gemini', etc.
  event_type TEXT NOT NULL CHECK (event_type IN (
    'invoice',
    'payment_receipt',
    'payment_failure',
    'credit_purchase',
    'credit_balance',
    'quota_warning',
    'spending_alert',
    'usage_threshold',
    'subscription_change',
    'renewal_notification',
    'account_change',
    'billing_change'
  )),
  event_date TIMESTAMPTZ,
  amount NUMERIC,
  currency TEXT DEFAULT 'USD',
  invoice_id TEXT,
  description TEXT,
  source_email_id TEXT NOT NULL, -- Gmail message ID for idempotency
  source_email_from TEXT, -- Sender email/domain
  source_email_subject TEXT,
  confidence NUMERIC DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional extracted data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Idempotency constraint: prevent duplicate events from same email
  CONSTRAINT unique_billing_event_per_email UNIQUE (user_id, source_email_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_provider_billing_events_user_id ON provider_billing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_billing_events_provider ON provider_billing_events(provider);
CREATE INDEX IF NOT EXISTS idx_provider_billing_events_event_type ON provider_billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_provider_billing_events_event_date ON provider_billing_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_provider_billing_events_created_at ON provider_billing_events(created_at DESC);

-- Enable Row Level Security
ALTER TABLE provider_billing_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own billing events
CREATE POLICY "Users can view own billing events"
  ON provider_billing_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own billing events"
  ON provider_billing_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add source attribution to api_integrations
ALTER TABLE api_integrations 
  ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'manual' CHECK (data_source IN (
    'manual',
    'provider_api',
    'email_billing_signal'
  )),
  ADD COLUMN IF NOT EXISTS provider_api_type TEXT CHECK (provider_api_type IN (
    'standard',
    'admin',
    'organization',
    'project',
    'none'
  )),
  ADD COLUMN IF NOT EXISTS account_identifier TEXT,
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS organization_id TEXT;

-- Add indexes for source queries
CREATE INDEX IF NOT EXISTS idx_api_integrations_data_source ON api_integrations(data_source);
CREATE INDEX IF NOT EXISTS idx_api_integrations_provider_api_type ON api_integrations(provider_api_type);
