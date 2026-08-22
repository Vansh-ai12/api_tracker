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

