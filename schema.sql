-- schema.sql
-- Supabase SQL schema for Unsub subscription tracking app

-- Enable pgcrypto (though usually enabled by default in Supabase, good practice to ensure)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================
-- 1. users
-- ==========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_chat_id BIGINT UNIQUE NOT NULL,
    forwarding_alias TEXT UNIQUE NOT NULL, -- e.g. "u4f2a9"
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- Restrict all access to service_role only (no public/anon access)
CREATE POLICY "service_role_all_users" ON users 
    AS PERMISSIVE FOR ALL 
    TO service_role 
    USING (true);


-- ==========================================
-- 2. subscriptions
-- ==========================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    domain TEXT, -- e.g. "canva.com", used for extension matching
    amount NUMERIC,
    currency TEXT DEFAULT 'INR',
    billing_cycle TEXT CHECK (billing_cycle IN ('weekly', 'monthly', 'yearly')),
    renewal_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    last_nudged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for common lookups and cron queries
CREATE INDEX idx_subscriptions_renewal_date ON subscriptions(renewal_date);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
-- Restrict all access to service_role only
CREATE POLICY "service_role_all_subscriptions" ON subscriptions 
    AS PERMISSIVE FOR ALL 
    TO service_role 
    USING (true);


-- ==========================================
-- 3. usage_reports
-- ==========================================
CREATE TABLE usage_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT CHECK (source IN ('self_report', 'extension')),
    used BOOLEAN NOT NULL,
    reported_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for common lookups
CREATE INDEX idx_usage_reports_subscription_id ON usage_reports(subscription_id);

-- Enable RLS on usage_reports
ALTER TABLE usage_reports ENABLE ROW LEVEL SECURITY;
-- Restrict all access to service_role only
CREATE POLICY "service_role_all_usage_reports" ON usage_reports 
    AS PERMISSIVE FOR ALL 
    TO service_role 
    USING (true);


-- ==========================================
-- 4. raw_emails
-- ==========================================
CREATE TABLE raw_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    raw_content TEXT NOT NULL,
    parse_status TEXT DEFAULT 'pending' CHECK (parse_status IN ('pending', 'parsed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on raw_emails
ALTER TABLE raw_emails ENABLE ROW LEVEL SECURITY;
-- Restrict all access to service_role only
CREATE POLICY "service_role_all_raw_emails" ON raw_emails 
    AS PERMISSIVE FOR ALL 
    TO service_role 
    USING (true);
