-- ArtBoost AI
-- P0 Durable Automation Claiming / Multi-Instance Scheduler Safety
-- 2026-08-18
--
-- Run this in Supabase SQL Editor BEFORE deploying the matching backend file.
-- After it succeeds, manually SAVE this SQL snippet in Supabase.

begin;

alter table public.store_automations
  add column if not exists run_lock_id text,
  add column if not exists run_lock_expires_at timestamptz,
  add column if not exists run_claimed_at timestamptz;

create index if not exists idx_store_automations_due_claim
  on public.store_automations (next_run_at, run_lock_expires_at)
  where enabled = true and next_run_at is not null;

create or replace function public.claim_due_store_automations(
  p_worker_id text,
  p_limit integer default 1,
  p_lock_seconds integer default 900
)
returns setof public.store_automations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 100));
  v_lock_seconds integer := greatest(60, least(coalesce(p_lock_seconds, 900), 3600));
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'p_worker_id is required';
  end if;

  return query
  with candidates as (
    select sa.id
    from public.store_automations sa
    where sa.enabled = true
      and sa.next_run_at is not null
      and sa.next_run_at <= now()
      and (
        sa.run_lock_expires_at is null
        or sa.run_lock_expires_at <= now()
      )
    order by sa.next_run_at asc
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.store_automations sa
    set
      run_lock_id = p_worker_id,
      run_claimed_at = now(),
      run_lock_expires_at =
        now() + make_interval(secs => v_lock_seconds),
      updated_at = now()
    where sa.id in (select id from candidates)
    returning sa.*
  )
  select *
  from claimed
  order by next_run_at asc;
end;
$$;

revoke all on function public.claim_due_store_automations(text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.claim_due_store_automations(text, integer, integer)
  to service_role;

commit;

-- Optional verification:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'store_automations'
--   and column_name in ('run_lock_id', 'run_lock_expires_at', 'run_claimed_at')
-- order by column_name;
