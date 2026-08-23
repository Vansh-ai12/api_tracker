-- schema-additions.sql
-- Run once in the Supabase SQL editor before deploying the updated app.

-- ============================================================
-- push_subscriptions
-- One row per browser device per user. Multiple rows per user
-- are expected (multi-device). Rows are deleted automatically
-- when web-push returns 410 Gone (expired/unregistered).
-- ============================================================
CREATE TABLE push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,  -- unique per browser device
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_push_subscriptions" ON push_subscriptions
  AS PERMISSIVE FOR ALL TO service_role USING (true);


-- ============================================================
-- web_sessions
-- Used for two-phase Telegram OTP login.
--   Phase 1 (request-login): otp filled, session_token NULL, verified false
--   Phase 2 (verify):        otp cleared, session_token filled, verified true
--                            expires_at extended to 30 days
-- ============================================================
CREATE TABLE web_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id  BIGINT      NOT NULL,
  otp               TEXT,                   -- 6-digit code; cleared after verification
  session_token     TEXT        UNIQUE,     -- long-lived cookie value after login
  expires_at        TIMESTAMPTZ NOT NULL,
  verified          BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by session_token (cookie value on every authenticated request)
CREATE INDEX idx_web_sessions_session_token ON web_sessions(session_token);
-- Fast lookup when verifying an OTP
CREATE INDEX idx_web_sessions_chat_otp      ON web_sessions(telegram_chat_id, otp);

ALTER TABLE web_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_web_sessions" ON web_sessions
  AS PERMISSIVE FOR ALL TO service_role USING (true);

-- User plan distinction (free / pro)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro'));

-- Telegram & Gmail tracking columns on users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'PRIVATE_EMAIL' CHECK (tracking_mode IN ('GMAIL', 'PRIVATE_EMAIL')),
  ADD COLUMN IF NOT EXISTS gmail_connected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmail_email TEXT,
  ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS gmail_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_last_scan_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_last_scan_status TEXT DEFAULT 'idle' CHECK (gmail_last_scan_status IN ('idle', 'scanning', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS gmail_last_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_users_forwarding_alias ON users(forwarding_alias);
CREATE INDEX IF NOT EXISTS idx_users_gmail_email ON users(gmail_email);

-- ============================================================
-- gmail_oauth_states
-- One-time, short-lived OAuth state authorization tokens
-- ============================================================
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
CREATE POLICY "service_role_all_gmail_oauth_states" ON gmail_oauth_states
  AS PERMISSIVE FOR ALL TO service_role USING (true);

-- ============================================================
-- subscription_evidence
-- Email evidence and source tracking for subscription deduplication
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_evidence (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source            TEXT        NOT NULL CHECK (source IN ('GMAIL', 'PRIVATE_EMAIL')),
  source_message_id TEXT        NOT NULL,
  source_thread_id  TEXT,
  source_sender     TEXT,
  source_subject    TEXT,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_source_message UNIQUE (user_id, source, source_message_id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_evidence_user_sub ON subscription_evidence(user_id, subscription_id);

ALTER TABLE subscription_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_subscription_evidence" ON subscription_evidence
  AS PERMISSIVE FOR ALL TO service_role USING (true);


