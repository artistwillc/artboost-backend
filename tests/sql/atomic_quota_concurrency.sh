#!/usr/bin/env bash
set -euo pipefail
# Disposable CI database only. Start both clients simultaneously.
psql -v ON_ERROR_STOP=1 <<'SQL'
insert into public.profiles(id,subscription_tier,monthly_campaign_count,campaign_reset_date)
values ('00000000-0000-0000-0000-000000000004','free',4,(current_date + interval '1 month')::date);
SQL
payload='{"platform":"Pinterest","title":"Concurrent test","description":"Test","image_url":"https://example.com/test-art.png","publish_at":"2030-01-01T12:00:00Z"}'
query="select (public.schedule_campaign_with_quota('00000000-0000-0000-0000-000000000004', '$payload'::jsonb)->>'allowed')::boolean;"
psql -v ON_ERROR_STOP=1 -Atc "$query" > /tmp/artboost-quota-a.txt &
a=$!
psql -v ON_ERROR_STOP=1 -Atc "$query" > /tmp/artboost-quota-b.txt &
b=$!
wait "$a"
wait "$b"
combined="$(cat /tmp/artboost-quota-a.txt /tmp/artboost-quota-b.txt | sort)"
if [[ "$combined" != $'f\nt' ]]; then
  echo "Expected exactly one successful campaign and one quota denial; got: $combined" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -Atc "select case when p.monthly_campaign_count=5 and (select count(*) from public.scheduled_campaigns s where s.user_id=p.id)=1 then 'pass' else 'fail' end from public.profiles p where p.id='00000000-0000-0000-0000-000000000004';" | grep -qx pass
echo "Concurrent fifth-slot race passed: one insert, one rejection."
