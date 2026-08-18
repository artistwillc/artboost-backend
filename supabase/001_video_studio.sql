-- ArtBoost AI Video Studio foundation
create table if not exists public.video_jobs (
  id uuid primary key,
  user_id uuid not null,
  product_id text not null,
  template_id text not null default 'cinematic',
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  source_images jsonb not null default '[]'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  source_quality jsonb,
  video_url text,
  cloudinary_public_id text,
  output_width integer default 1080,
  output_height integer default 1920,
  output_fps integer default 30,
  output_format text default 'mp4',
  output_bytes bigint,
  duration_seconds numeric,
  quality_preset text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_jobs_user_created_idx on public.video_jobs (user_id, created_at desc);
create index if not exists video_jobs_queue_idx on public.video_jobs (status, created_at asc) where status = 'queued';
create index if not exists video_jobs_product_idx on public.video_jobs (user_id, product_id, created_at desc);

alter table public.video_jobs enable row level security;

-- The mobile client currently uses the ArtBoost backend for this feature; the backend uses the service role.
-- Keep direct client table access closed until authenticated RLS policies are intentionally added.
