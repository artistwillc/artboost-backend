-- Apple Guideline 1.2: durable UGC safety reporting and user blocking.
create table if not exists public.ugc_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  details text not null,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists ugc_reports_status_created_idx on public.ugc_reports(status, created_at);
create index if not exists ugc_reports_reporter_idx on public.ugc_reports(reporter_user_id, created_at desc);
alter table public.ugc_reports enable row level security;

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);
create index if not exists user_blocks_blocker_idx on public.user_blocks(blocker_user_id);
alter table public.user_blocks enable row level security;

-- Client applications do not write these moderation tables directly.
-- The ArtBoost backend authenticates the caller and writes with its service role.
