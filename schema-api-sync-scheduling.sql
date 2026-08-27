-- Add sync scheduling fields to api_integrations table
-- These fields are used by the automatic sync cron job

ALTER TABLE api_integrations
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER DEFAULT 360,
  ADD COLUMN IF NOT EXISTS last_sync_started_at TIMESTAMPTZ;
