create table if not exists public.feature_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Other',
  suggestion text not null,
  use_case text,
  app_version text,
  subscription_tier text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
create index if not exists feature_suggestions_user_created_idx on public.feature_suggestions(user_id, created_at desc);
alter table public.feature_suggestions enable row level security;

create table if not exists public.analytics_attention_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issue_key text not null,
  created_at timestamptz not null default now(),
  unique(user_id, issue_key)
);
create index if not exists analytics_attention_dismissals_user_idx on public.analytics_attention_dismissals(user_id);
alter table public.analytics_attention_dismissals enable row level security;
