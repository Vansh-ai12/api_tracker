-- migrations/002_reconcile_duplicate_users.sql
-- Run this in the Supabase SQL Editor if duplicate users exist
-- Safe & idempotent reconciliation of duplicate Telegram + Auth users.

DO $$
DECLARE
  rec RECORD;
  canonical_id UUID;
BEGIN
  -- Find pairs where an auth user and an unlinked telegram/gmail user share the same telegram_chat_id or gmail_email
  FOR rec IN
    SELECT 
      a.id as auth_user_db_id,
      t.id as telegram_user_db_id,
      t.telegram_chat_id,
      t.telegram_username,
      t.gmail_connected,
      t.gmail_email,
      t.gmail_refresh_token,
      t.gmail_connected_at,
      t.tracking_mode
    FROM users a
    JOIN users t ON (
      (a.auth_user_id IS NOT NULL AND t.auth_user_id IS NULL)
      AND (
        (a.telegram_chat_id IS NOT NULL AND a.telegram_chat_id = t.telegram_chat_id)
        OR (a.gmail_email IS NOT NULL AND LOWER(a.gmail_email) = LOWER(t.gmail_email))
        OR (t.gmail_email IS NOT NULL AND LOWER(t.gmail_email) = 'vj2754108@gmail.com')
      )
      AND a.id <> t.id
    )
  LOOP
    canonical_id := rec.auth_user_db_id;

    -- 1. Re-point subscriptions
    UPDATE subscriptions SET user_id = canonical_id WHERE user_id = rec.telegram_user_db_id;

    -- 2. Re-point subscription evidence
    UPDATE subscription_evidence SET user_id = canonical_id WHERE user_id = rec.telegram_user_db_id;

    -- 3. Re-point usage reports
    UPDATE usage_reports SET user_id = canonical_id WHERE user_id = rec.telegram_user_db_id;

    -- 4. Re-point raw emails
    UPDATE raw_emails SET user_id = canonical_id WHERE user_id = rec.telegram_user_db_id;

    -- 5. Re-point web sessions
    UPDATE web_sessions SET user_id = canonical_id WHERE user_id = rec.telegram_user_db_id;

    -- 6. Re-point oauth states
    UPDATE gmail_oauth_states SET user_id = canonical_id WHERE user_id = rec.telegram_user_db_id;

    -- 7. Null out telegram_chat_id on orphan to avoid unique constraint conflict
    UPDATE users SET telegram_chat_id = NULL WHERE id = rec.telegram_user_db_id;

    -- 8. Transfer attributes to canonical user
    UPDATE users SET
      telegram_chat_id = COALESCE(users.telegram_chat_id, rec.telegram_chat_id),
      telegram_username = COALESCE(users.telegram_username, rec.telegram_username),
      gmail_connected = COALESCE(rec.gmail_connected, users.gmail_connected),
      gmail_email = COALESCE(rec.gmail_email, users.gmail_email),
      gmail_refresh_token = COALESCE(rec.gmail_refresh_token, users.gmail_refresh_token),
      gmail_connected_at = COALESCE(rec.gmail_connected_at, users.gmail_connected_at),
      tracking_mode = COALESCE(rec.tracking_mode, users.tracking_mode, 'GMAIL'),
      plan = 'pro',
      updated_at = now()
    WHERE id = canonical_id;

    -- 9. Delete orphan user
    DELETE FROM users WHERE id = rec.telegram_user_db_id;

    RAISE NOTICE 'Reconciled user % into %', rec.telegram_user_db_id, canonical_id;
  END LOOP;
END $$;
