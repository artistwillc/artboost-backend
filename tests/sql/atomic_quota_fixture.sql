-- Isolated PostgreSQL test fixture. Never run against production.
create schema if not exists public;
create table public.profiles (
 id uuid primary key,
 subscription_tier text default 'free',
 monthly_campaign_count integer default 0,
 campaign_reset_date date
);
create table public.scheduled_campaigns (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 platform text not null,
 campaign_group_id text,
 title text not null,
 description text not null,
 hashtags text,
 cta text,
 image_url text,
 product_link text,
 board_id text,
 page_id text,
 publish_at timestamptz not null,
 status text,
 campaign_status text,
 repeat_type text,
 next_run_at timestamptz,
 repeat_until timestamptz,
 error text,
 updated_at timestamptz
);
-- Mirror the Supabase roles referenced in the migration.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$roles$;
