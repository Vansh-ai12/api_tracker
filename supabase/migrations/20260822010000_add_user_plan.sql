-- Add plan column to public.users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro'));

-- Notify schema cache update
NOTIFY pgrst, 'reload schema';
