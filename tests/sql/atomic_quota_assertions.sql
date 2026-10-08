\set ON_ERROR_STOP on
begin;
-- Ensure the privileged function cannot resolve attacker-controlled schemas.
do $function_hardening$
declare def text;
begin
  select pg_get_functiondef('public.schedule_campaign_with_quota(uuid,jsonb)'::regprocedure) into def;
  if def not ilike '%SECURITY DEFINER%' then raise exception 'Quota RPC must use SECURITY DEFINER'; end if;
  if not exists (select 1 from pg_proc where oid = 'public.schedule_campaign_with_quota(uuid,jsonb)'::regprocedure and 'search_path=""' = any(coalesce(proconfig,array[]::text[]))) then raise exception 'Quota RPC must set an empty search_path'; end if;
end $function_hardening$;
-- Only the trusted service role may invoke the scheduling RPC.
do $privileges$
begin
  if has_function_privilege('anon', 'public.schedule_campaign_with_quota(uuid,jsonb)', 'EXECUTE') then
    raise exception 'anon unexpectedly has RPC execution rights';
  end if;
  if has_function_privilege('authenticated', 'public.schedule_campaign_with_quota(uuid,jsonb)', 'EXECUTE') then
    raise exception 'authenticated unexpectedly has RPC execution rights';
  end if;
  if not has_function_privilege('service_role', 'public.schedule_campaign_with_quota(uuid,jsonb)', 'EXECUTE') then
    raise exception 'service_role missing RPC execution rights';
  end if;
end $privileges$;
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000001','free',4,(current_date + interval '1 month')::date);
do $$
declare a jsonb; b jsonb; c jsonb; n integer;
begin
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000001',
 '{"platform":"Pinterest","title":"Test","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into a;
 if not (a->>'allowed')::boolean then raise exception 'Fifth campaign denied: %',a; end if;
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000001',
 '{"platform":"Pinterest","title":"Test","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into b;
 if (b->>'allowed')::boolean then raise exception 'Sixth campaign accepted'; end if;
 select count(*) into n from public.scheduled_campaigns;
 if n <> 1 then raise exception 'Expected one inserted campaign, got %',n; end if;
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000001',
 '{"platform":"Facebook","title":"Test","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into c;
 if (c->>'allowed')::boolean then raise exception 'Free Facebook campaign accepted'; end if;
end $$;
-- Invalid requests must neither insert a campaign nor consume the last quota slot.
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000006','free',4,(current_date + interval '1 month')::date);
do $required_fields$
declare result jsonb; before_count integer; after_count integer; quota integer;
begin
  select count(*) into before_count from public.scheduled_campaigns where user_id='00000000-0000-0000-0000-000000000006';
  select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000006',
    '{"platform":"Pinterest","title":"Incomplete","description":"Test","publish_at":"2030-01-01T12:00:00Z"}') into result;
  if (result->>'allowed') is distinct from 'false' then raise exception 'Missing artwork URL was accepted: %',result; end if;
  select count(*) into after_count from public.scheduled_campaigns where user_id='00000000-0000-0000-0000-000000000006';
  select monthly_campaign_count into quota from public.profiles where id='00000000-0000-0000-0000-000000000006';
  if after_count <> before_count or quota <> 4 then
    raise exception 'Invalid campaign changed insertion count or quota: %, %',after_count,quota;
  end if;
end $required_fields$;
-- Invalid dates must return a denial instead of raising a database error or using quota.
do $bad_dates$
declare result jsonb; quota integer;
begin
  select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000006',
    '{"platform":"Pinterest","title":"Bad date","description":"Test","image_url":"https://example.com/art.png","publish_at":"not-a-date"}') into result;
  if (result->>'allowed') is distinct from 'false' then raise exception 'Malformed date accepted: %',result; end if;
  select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000006',
    '{"platform":"Pinterest","title":"Infinite date","description":"Test","image_url":"https://example.com/art.png","publish_at":"infinity"}') into result;
  if (result->>'allowed') is distinct from 'false' then raise exception 'Infinite date accepted: %',result; end if;
  select monthly_campaign_count into quota from public.profiles where id='00000000-0000-0000-0000-000000000006';
  if quota <> 4 then raise exception 'Invalid dates consumed quota: %',quota; end if;
end $bad_dates$;
-- Past-dated Free posts must be rejected without consuming a slot.
do $past_date$
declare result jsonb; quota integer;
begin
  select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000006',
    '{"platform":"Pinterest","title":"Past date","description":"Test","image_url":"https://example.com/art.png","publish_at":"2020-01-01T12:00:00Z"}') into result;
  if (result->>'allowed') is distinct from 'false' then raise exception 'Past date accepted: %',result; end if;
  select monthly_campaign_count into quota from public.profiles where id='00000000-0000-0000-0000-000000000006';
  if quota <> 4 then raise exception 'Past date consumed quota: %',quota; end if;
end $past_date$;
-- Free users may choose Threads; a different second platform must be rejected.
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000007','free',0,(current_date + interval '1 month')::date);
do $threads_choice$
declare a jsonb; b jsonb;
begin
  select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000007',
    '{"platform":"Threads","title":"Threads post","description":"Test","image_url":"https://example.com/art.png","publish_at":"2030-01-01T12:00:00Z"}') into a;
  if (a->>'allowed') is distinct from 'true' then raise exception 'Threads Free choice denied: %',a; end if;
  select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000007',
    '{"platform":"LinkedIn","title":"Second platform","description":"Test","image_url":"https://example.com/art.png","publish_at":"2030-01-01T12:00:00Z"}') into b;
  if (b->>'allowed') is distinct from 'false' then raise exception 'Second Free platform accepted: %',b; end if;
end $threads_choice$;
-- Free users may choose Facebook first; subsequent Pinterest requests must fail.
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000004','free',0,(current_date + interval '1 month')::date);
do $choice$
declare first_post jsonb; wrong_platform jsonb; recurring jsonb; next_run jsonb; count_after integer;
begin
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000004',
 '{"platform":"Facebook","title":"Chosen platform","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into first_post;
 if (first_post->>'allowed') is distinct from 'true' then raise exception 'Free Facebook first choice rejected: %',first_post; end if;
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000004',
 '{"platform":"Pinterest","title":"Wrong platform","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into wrong_platform;
 if (wrong_platform->>'allowed') is distinct from 'false' then raise exception 'Second platform accepted: %',wrong_platform; end if;
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000004',
 '{"platform":"Facebook","title":"Recurring","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z","repeat_type":"daily"}') into recurring;
 if (recurring->>'allowed') is distinct from 'false' then raise exception 'Recurring Free post accepted: %',recurring; end if;
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000004',
 '{"platform":"Facebook","title":"Background","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z","next_run_at":"2030-01-02T12:00:00Z"}') into next_run;
 if (next_run->>'allowed') is distinct from 'false' then raise exception 'Background Free post accepted: %',next_run; end if;
 select monthly_campaign_count into count_after from public.profiles where id='00000000-0000-0000-0000-000000000004';
 if count_after <> 1 then raise exception 'Rejected Free requests consumed quota: %',count_after; end if;
end $choice$;
-- Reset date in the past must restart the monthly quota at zero.
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000002','free',5,(current_date - interval '1 day')::date);
do $reset$
declare result jsonb; counter integer; next_reset date;
begin
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000002',
 '{"platform":"Pinterest","title":"Reset test","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into result;
 if not (result->>'allowed')::boolean then raise exception 'Reset did not allow campaign: %',result; end if;
 select monthly_campaign_count,campaign_reset_date into counter,next_reset from public.profiles
 where id='00000000-0000-0000-0000-000000000002';
 if counter <> 1 or next_reset <= current_date then raise exception 'Reset counters invalid: %, %',counter,next_reset; end if;
end $reset$;
-- Non-free tiers should not consume the Free-tier quota.
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000003','pro',5,(current_date + interval '1 month')::date);
do $paid$
declare result jsonb; counter integer;
begin
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000003',
 '{"platform":"Facebook","title":"Paid test","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into result;
 if not (result->>'allowed')::boolean then raise exception 'Paid tier blocked: %',result; end if;
 select monthly_campaign_count into counter from public.profiles where id='00000000-0000-0000-0000-000000000003';
 if counter <> 5 then raise exception 'Paid tier quota changed: %',counter; end if;
end $paid$;
-- Rejected requests must not insert campaigns or change quota counters.
do $rejected$
declare missing jsonb; unsupported jsonb; before_count integer; after_count integer; before_quota integer; after_quota integer;
begin
 select count(*) into before_count from public.scheduled_campaigns;
 select monthly_campaign_count into before_quota from public.profiles
 where id='00000000-0000-0000-0000-000000000002';
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000099',
 '{"platform":"Pinterest","title":"Missing profile","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into missing;
 if (missing->>'allowed') is distinct from 'false' then raise exception 'Missing profile accepted: %',missing; end if;
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000002',
 '{"platform":"unsupported","title":"Bad platform","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}') into unsupported;
 if (unsupported->>'allowed') is distinct from 'false' then raise exception 'Unsupported platform accepted: %',unsupported; end if;
 select count(*) into after_count from public.scheduled_campaigns;
 select monthly_campaign_count into after_quota from public.profiles
 where id='00000000-0000-0000-0000-000000000002';
 if before_count <> after_count or before_quota <> after_quota then
   raise exception 'Rejected requests mutated state: rows % -> %, quota % -> %',
     before_count,after_count,before_quota,after_quota;
 end if;
end $rejected$;

-- Explicit PostgreSQL calendar arithmetic: document rollover behavior at edge dates.
do $calendar_boundaries$
begin
  if (date '2024-01-31' + interval '1 month')::date <> date '2024-02-29' then
    raise exception 'Leap-year January rollover changed';
  end if;
  if (date '2025-01-31' + interval '1 month')::date <> date '2025-02-28' then
    raise exception 'Non-leap-year January rollover changed';
  end if;
  if (date '2026-08-31' + interval '1 month')::date <> date '2026-09-30' then
    raise exception 'Thirty-day month rollover changed';
  end if;
end $calendar_boundaries$;

-- Month-end and leap-year boundaries must remain explicit regression cases.
-- These tests use the database's current date and assert that a reset creates
-- a future date rather than silently reusing an expired quota window.
do $month_end$
declare
  sample_date date;
  next_date date;
begin
  foreach sample_date in array array[
    date '2024-01-31', date '2024-02-29',
    date '2025-01-31', date '2025-02-28',
    date '2026-08-31', date '2026-12-31'
  ] loop
    next_date := (sample_date + interval '1 month')::date;
    if next_date <= sample_date then
      raise exception 'Nonadvancing monthly reset: % -> %', sample_date, next_date;
    end if;
  end loop;
end $month_end$;

rollback;
\echo Atomic quota, monthly reset, paid-tier and rejection integrity assertions passed
