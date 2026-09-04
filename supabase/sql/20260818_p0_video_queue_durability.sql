-- ArtBoost AI
-- P0 Video Studio Queue Durability / Multi-Instance Claiming
-- 2026-08-18
--
-- Run this in Supabase SQL Editor BEFORE deploying the matching backend patch.
-- After success, manually SAVE this SQL snippet in Supabase.

begin;

alter table public.video_jobs
  add column if not exists worker_id text,
  add column if not exists lock_expires_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_heartbeat_at timestamptz;

create index if not exists idx_video_jobs_queue_claim
  on public.video_jobs (status, created_at, lock_expires_at);

create or replace function public.claim_next_video_job(
  p_worker_id text,
  p_lock_seconds integer default 1800
)
returns setof public.video_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_seconds integer :=
    greatest(300, least(coalesce(p_lock_seconds, 1800), 7200));
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'p_worker_id is required';
  end if;

  return query
  with candidate as (
    select vj.id
    from public.video_jobs vj
    where
      (
        vj.status = 'queued'
        or (
          vj.status = 'processing'
          and vj.lock_expires_at is not null
          and vj.lock_expires_at <= now()
        )
      )
      and (
        vj.lock_expires_at is null
        or vj.lock_expires_at <= now()
      )
    order by
      case when vj.status = 'queued' then 0 else 1 end,
      vj.created_at asc
    for update skip locked
    limit 1
  ),
  claimed as (
    update public.video_jobs vj
    set
      status = 'processing',
      progress = greatest(coalesce(vj.progress, 0), 3),
      started_at = coalesce(vj.started_at, now()),
      error_message = null,
      worker_id = p_worker_id,
      claimed_at = now(),
      last_heartbeat_at = now(),
      lock_expires_at =
        now() + make_interval(secs => v_lock_seconds),
      attempt_count = coalesce(vj.attempt_count, 0) + 1,
      updated_at = now()
    where vj.id in (select id from candidate)
    returning vj.*
  )
  select *
  from claimed;
end;
$$;

create or replace function public.heartbeat_video_job(
  p_job_id uuid,
  p_worker_id text,
  p_lock_seconds integer default 1800
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_seconds integer :=
    greatest(300, least(coalesce(p_lock_seconds, 1800), 7200));
  v_updated integer;
begin
  update public.video_jobs
  set
    last_heartbeat_at = now(),
    lock_expires_at =
      now() + make_interval(secs => v_lock_seconds),
    updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and worker_id = p_worker_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.claim_next_video_job(text, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_video_job(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.claim_next_video_job(text, integer)
  to service_role;
grant execute on function public.heartbeat_video_job(uuid, text, integer)
  to service_role;

commit;

-- Optional verification:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'video_jobs'
--   and column_name in (
--     'worker_id',
--     'lock_expires_at',
--     'claimed_at',
--     'attempt_count',
--     'last_heartbeat_at'
--   )
-- order by column_name;
