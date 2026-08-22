-- Reconcile the tables used by the existing Telegram OTP authentication flow.
-- This is intentionally idempotent: it repairs deployments where the earlier
-- auth migration was not applied and is harmless where it already was.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.web_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  telegram_chat_id  BIGINT,
  otp               TEXT,
  session_token     TEXT        UNIQUE,
  expires_at        TIMESTAMPTZ NOT NULL,
  verified          BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.web_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'web_sessions' AND column_name = 'telegram_chat_id'
  ) THEN
    ALTER TABLE public.web_sessions ADD COLUMN telegram_chat_id BIGINT;
  ELSE
    ALTER TABLE public.web_sessions ALTER COLUMN telegram_chat_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_web_sessions_session_token
  ON public.web_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_web_sessions_chat_otp
  ON public.web_sessions(telegram_chat_id, otp);
CREATE INDEX IF NOT EXISTS idx_web_sessions_user_id
  ON public.web_sessions(user_id);

ALTER TABLE public.web_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_sessions'
      AND policyname = 'service_role_all_web_sessions'
  ) THEN
    CREATE POLICY "service_role_all_web_sessions" ON public.web_sessions
      AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- A temporary, browser-scoped association created before opening the bot.
-- It is not a web session and cannot authenticate a browser by itself.
CREATE TABLE IF NOT EXISTS public.telegram_login_links (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  link_token        TEXT        NOT NULL UNIQUE,
  user_id           UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  telegram_chat_id  BIGINT,
  expires_at        TIMESTAMPTZ NOT NULL,
  connected_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telegram_login_links_connection_check CHECK (
    (user_id IS NOT NULL AND telegram_chat_id IS NULL AND connected_at IS NULL)
    OR
    (user_id IS NOT NULL AND telegram_chat_id IS NOT NULL AND connected_at IS NOT NULL)
  )
);

-- The original login-link migration used a pre-account pairing record. Keep
-- those historical rows valid while making new links explicitly user-bound.
ALTER TABLE public.telegram_login_links
  DROP CONSTRAINT IF EXISTS telegram_login_links_connection_check;
ALTER TABLE public.telegram_login_links
  ADD CONSTRAINT telegram_login_links_connection_check CHECK (
    (user_id IS NULL AND telegram_chat_id IS NULL AND connected_at IS NULL)
    OR
    (user_id IS NOT NULL AND telegram_chat_id IS NULL AND connected_at IS NULL)
    OR
    (user_id IS NOT NULL AND telegram_chat_id IS NOT NULL AND connected_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_telegram_login_links_expires_at
  ON public.telegram_login_links(expires_at);

ALTER TABLE public.telegram_login_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'telegram_login_links'
      AND policyname = 'service_role_all_telegram_login_links'
  ) THEN
    CREATE POLICY "service_role_all_telegram_login_links" ON public.telegram_login_links
      AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Supabase Auth owns credentials. Keep application data in the existing
-- users table and link it to the corresponding auth.users record.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ALTER COLUMN telegram_chat_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Make newly created tables visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
