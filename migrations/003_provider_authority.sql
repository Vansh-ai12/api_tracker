-- Provider billing signals are secondary evidence from Gmail. They never
-- override API usage snapshots.
CREATE TABLE IF NOT EXISTS provider_billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date TIMESTAMPTZ,
  amount NUMERIC,
  currency TEXT,
  invoice_id TEXT,
  description TEXT,
  source_email_id TEXT NOT NULL,
  source_email_from TEXT,
  source_email_subject TEXT,
  confidence NUMERIC NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_billing_events_email_unique UNIQUE (user_id, source_email_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_billing_events_user_date ON provider_billing_events(user_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_provider_billing_events_provider ON provider_billing_events(provider);
ALTER TABLE provider_billing_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users can view own provider billing events" ON provider_billing_events FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Source and credential-mode labels ensure manual data can never masquerade
-- as provider authority.
ALTER TABLE api_integrations
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'manual' CHECK (data_source IN ('manual', 'provider_api', 'email_billing_signal')),
  ADD COLUMN IF NOT EXISTS provider_api_type TEXT CHECK (provider_api_type IN ('standard', 'admin', 'organization', 'project', 'none')),
  ADD COLUMN IF NOT EXISTS account_identifier TEXT,
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS organization_id TEXT;

-- Authoritative provider observations are intentionally separate from manual
-- integration fields and Gmail billing signals.
CREATE TABLE IF NOT EXISTS api_usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES api_integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source = 'provider_api'),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  project_id TEXT,
  model TEXT,
  api_key_id TEXT,
  input_tokens NUMERIC,
  output_tokens NUMERIC,
  cached_input_tokens NUMERIC,
  request_count NUMERIC,
  total_tokens NUMERIC,
  cost NUMERIC,
  currency TEXT,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('completed', 'unavailable', 'failed')),
  snapshot_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_usage_snapshots_idempotency UNIQUE (integration_id, snapshot_key)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_snapshots_user_provider_period
  ON api_usage_snapshots(user_id, provider, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_snapshots_integration_period
  ON api_usage_snapshots(integration_id, period_start DESC);

CREATE TABLE IF NOT EXISTS provider_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES api_integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'unavailable', 'failed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_sync_runs_integration_started
  ON provider_sync_runs(integration_id, started_at DESC);

CREATE TABLE IF NOT EXISTS renewal_notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  renewal_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending',
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT renewal_notification_events_unique UNIQUE (subscription_id, renewal_date)
);
CREATE INDEX IF NOT EXISTS idx_renewal_notification_events_user ON renewal_notification_events(user_id, created_at DESC);
ALTER TABLE renewal_notification_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE api_usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_sync_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users can view own provider usage snapshots" ON api_usage_snapshots FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can view own provider sync runs" ON provider_sync_runs FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can view own renewal notification events" ON renewal_notification_events FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
