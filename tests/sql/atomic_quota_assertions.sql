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
rollback;
\echo Atomic quota basic assertions passed
