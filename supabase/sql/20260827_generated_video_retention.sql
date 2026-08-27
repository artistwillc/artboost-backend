-- ArtBoost AI generated-video retention support
-- Run once in Supabase SQL Editor BEFORE deploying the cleanup worker.

alter table if exists public.video_jobs
  add column if not exists cloudinary_public_id text,
  add column if not exists retention_deleted_at timestamptz,
  add column if not exists retention_delete_reason text;

create index if not exists video_jobs_retention_cleanup_idx
  on public.video_jobs (status, completed_at)
  where cloudinary_public_id is not null and video_url is not null;

comment on column public.video_jobs.cloudinary_public_id is
  'Exact Cloudinary public_id returned by ArtBoost video generation; used for safe single-asset retention deletion.';
comment on column public.video_jobs.retention_deleted_at is
  'Timestamp when the generated Cloudinary video was removed by the ArtBoost retention worker.';
