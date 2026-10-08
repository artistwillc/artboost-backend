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
-- Mirror the Supabase role referenced in the migration.
do $$ begin
 if not exists (select 1 from pg_roles where rolname='service_role') then
   create role service_role nologin;
 end if;
end $;
do $ begin
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $;
