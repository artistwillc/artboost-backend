-- REVIEW BEFORE APPLYING. Requires trusted server/service-role invocation only.
-- Campaign insertion and free-tier quota accounting share one PostgreSQL transaction.
create or replace function public.schedule_campaign_with_quota(
  p_user_id uuid,
  p_campaign jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  inserted public.scheduled_campaigns%rowtype;
  platform_key text := lower(trim(coalesce(p_campaign->>'platform', '')));
  today_utc date := (now() at time zone 'UTC')::date;
  reset_date date;
  campaign_count integer;
begin
  -- A row lock serializes all quota decisions for the same user.
  select * into p from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('allowed',false,'reason','Profile not found');
  end if;
  if platform_key not in ('pinterest','facebook','instagram','x') then
    return jsonb_build_object('allowed',false,'reason','Unsupported platform');
  end if;
  if coalesce(p.subscription_tier,'free') = 'free' then
    if platform_key <> 'pinterest' then
      return jsonb_build_object('allowed',false,'reason','Free users can only use Pinterest.');
    end if;
    reset_date := p.campaign_reset_date;
    campaign_count := coalesce(p.monthly_campaign_count,0);
    if reset_date is null or today_utc >= reset_date then
      -- Calendar-month advance, anchored to the date of the reset.
      reset_date := (today_utc + interval '1 month')::date;
      campaign_count := 0;
    end if;
    if campaign_count >= 5 then
      return jsonb_build_object('allowed',false,'reason','Free users are limited to 5 campaigns per month.');
    end if;
  end if;

  -- Explicit field allowlist prevents a caller from overriding ownership/status.
  insert into public.scheduled_campaigns (
    user_id, platform, campaign_group_id, title, description, hashtags, cta,
    image_url, product_link, board_id, page_id, publish_at, status,
    campaign_status, repeat_type, next_run_at, repeat_until, error, updated_at
  ) values (
    p_user_id, p_campaign->>'platform', p_campaign->>'campaign_group_id',
    p_campaign->>'title', p_campaign->>'description', p_campaign->>'hashtags',
    p_campaign->>'cta', p_campaign->>'image_url', p_campaign->>'product_link',
    p_campaign->>'board_id', p_campaign->>'page_id',
    (p_campaign->>'publish_at')::timestamptz, 'scheduled', 'active',
    coalesce(p_campaign->>'repeat_type','one_time'),
    (p_campaign->>'next_run_at')::timestamptz,
    (p_campaign->>'repeat_until')::timestamptz, null, now()
  ) returning * into inserted;

  if coalesce(p.subscription_tier,'free') = 'free' then
    update public.profiles
      set monthly_campaign_count = campaign_count + 1,
          campaign_reset_date = reset_date
      where id = p_user_id;
  end if;

  return jsonb_build_object('allowed',true,'campaign',to_jsonb(inserted));
end;
$$;

-- Restrict RPC to service_role; the backend must authenticate the actual caller
-- and validate ownership before invoking this function.
revoke all on function public.schedule_campaign_with_quota(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.schedule_campaign_with_quota(uuid,jsonb) to service_role;
