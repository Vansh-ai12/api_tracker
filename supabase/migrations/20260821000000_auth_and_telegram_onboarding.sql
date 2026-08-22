-- Database-backed Telegram OTP sessions and temporary browser-to-bot links.
-- Safe to apply to projects where web_sessions was already created manually.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.web_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id  BIGINT      NOT NULL,
  otp               TEXT,
  session_token     TEXT        UNIQUE,
  expires_at        TIMESTAMPTZ NOT NULL,
  verified          BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_sessions_session_token
  ON public.web_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_web_sessions_chat_otp
  ON public.web_sessions(telegram_chat_id, otp);

ALTER TABLE public.web_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_sessions'
      AND policyname = 'service_role_all_web_sessions'
  ) THEN
    CREATE POLICY "service_role_all_web_sessions" ON public.web_sessions
      AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- This table stores a short-lived pairing token only. It is not a web
-- session and cannot authenticate a browser by itself.
CREATE TABLE IF NOT EXISTS public.telegram_login_links (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  link_token        TEXT        NOT NULL UNIQUE,
  user_id           UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  telegram_chat_id  BIGINT,
  expires_at        TIMESTAMPTZ NOT NULL,
  connected_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telegram_login_links_connection_check CHECK (
    (user_id IS NULL AND telegram_chat_id IS NULL AND connected_at IS NULL)
    OR
    (user_id IS NOT NULL AND telegram_chat_id IS NOT NULL AND connected_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_telegram_login_links_expires_at
  ON public.telegram_login_links(expires_at);

ALTER TABLE public.telegram_login_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'telegram_login_links'
      AND policyname = 'service_role_all_telegram_login_links'
  ) THEN
    CREATE POLICY "service_role_all_telegram_login_links" ON public.telegram_login_links
      AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Ensure PostgREST sees the newly created tables without waiting for a reload.
NOTIFY pgrst, 'reload schema';
