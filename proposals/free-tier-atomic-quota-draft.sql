-- Proposed migration; review and test before applying to production.
-- Atomic free-tier quota reservation. Call only from trusted backend with verified user identity.
create or replace function public.reserve_free_campaign_slot(p_user_id uuid, p_platform text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  today_utc date := (now() at time zone 'UTC')::date;
begin
  select * into p from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'Profile not found');
  end if;
  if coalesce(p.subscription_tier, 'free') <> 'free' then
    return jsonb_build_object('allowed', true, 'reserved', false);
  end if;
  if lower(trim(coalesce(p_platform, ''))) <> 'pinterest' then
    return jsonb_build_object('allowed', false, 'reason', 'Free users can only use Pinterest.');
  end if;
  if p.campaign_reset_date is null or today_utc >= p.campaign_reset_date then
    update public.profiles set monthly_campaign_count = 0,
      campaign_reset_date = (today_utc + interval '1 month')::date
    where id = p_user_id;
    p.monthly_campaign_count := 0;
  end if;
  if coalesce(p.monthly_campaign_count, 0) >= 5 then
    return jsonb_build_object('allowed', false, 'reason', 'Free users are limited to 5 campaigns per month.');
  end if;
  update public.profiles
    set monthly_campaign_count = coalesce(monthly_campaign_count, 0) + 1
    where id = p_user_id;
  return jsonb_build_object('allowed', true, 'reserved', true);
end;
$$;
-- SECURITY NOTE: This is a reservation primitive, not a complete transaction.
-- For strict consistency, move campaign INSERT into this same database function
-- and authorize its caller; do not deploy this draft standalone.
revoke all on function public.reserve_free_campaign_slot(uuid,text) from public, anon, authenticated;
