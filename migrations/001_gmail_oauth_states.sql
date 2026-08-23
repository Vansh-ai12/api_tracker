-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- This creates the gmail_oauth_states table if it does not already exist.
-- Safe to run multiple times (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS gmail_oauth_states (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  state             TEXT        UNIQUE NOT NULL,
  telegram_chat_id  BIGINT      NOT NULL,
  user_id           UUID        REFERENCES users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gmail_oauth_states_state ON gmail_oauth_states(state);

ALTER TABLE gmail_oauth_states ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (the server uses SUPABASE_SERVICE_ROLE_KEY)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gmail_oauth_states'
      AND policyname = 'service_role_all_gmail_oauth_states'
  ) THEN
    CREATE POLICY "service_role_all_gmail_oauth_states" ON gmail_oauth_states
      AS PERMISSIVE FOR ALL TO service_role USING (true);
  END IF;
END
$$;

-- Also ensure the users table has the Gmail-related columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'PRIVATE_EMAIL',
  ADD COLUMN IF NOT EXISTS gmail_connected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmail_email TEXT,
  ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS gmail_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_last_scan_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_last_scan_status TEXT DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS gmail_last_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
