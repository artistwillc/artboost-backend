\set ON_ERROR_STOP on
begin;
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000001','free',4,(current_date + interval '1 month')::date);
do $$
declare a jsonb; b jsonb; c jsonb; n integer;
begin
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000001',
 '{"platform":"Pinterest","title":"Test","description":"Test","publish_at":"2030-01-01T12:00:00Z"}') into a;
 if not (a->>'allowed')::boolean then raise exception 'Fifth campaign denied: %',a; end if;
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000001',
 '{"platform":"Pinterest","title":"Test","description":"Test","publish_at":"2030-01-01T12:00:00Z"}') into b;
 if (b->>'allowed')::boolean then raise exception 'Sixth campaign accepted'; end if;
 select count(*) into n from public.scheduled_campaigns;
 if n <> 1 then raise exception 'Expected one inserted campaign, got %',n; end if;
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000001',
 '{"platform":"Facebook","title":"Test","description":"Test","publish_at":"2030-01-01T12:00:00Z"}') into c;
 if (c->>'allowed')::boolean then raise exception 'Free Facebook campaign accepted'; end if;
end $$;
-- Reset date in the past must restart the monthly quota at zero.
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000002','free',5,(current_date - interval '1 day')::date);
do $reset$
declare result jsonb; counter integer; next_reset date;
begin
 select public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000002',
 '{"platform":"Pinterest","title":"Reset test","description":"Test","publish_at":"2030-01-01T12:00:00Z"}') into result;
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
 '{"platform":"Facebook","title":"Paid test","description":"Test","publish_at":"2030-01-01T12:00:00Z"}') into result;
 if not (result->>'allowed')::boolean then raise exception 'Paid tier blocked: %',result; end if;
 select monthly_campaign_count into counter from public.profiles where id='00000000-0000-0000-0000-000000000003';
 if counter <> 5 then raise exception 'Paid tier quota changed: %',counter; end if;
end $paid$;
rollback;
\echo Atomic quota basic, monthly reset and paid-tier assertions passed
