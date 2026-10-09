-- Disposable PostgreSQL fixture matching the effective ownership rules in production.
-- Never run this file against production.
begin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.rls_ownership_probe (
  id uuid primary key,
  user_id uuid not null,
  title text not null
);
alter table public.rls_ownership_probe enable row level security;
grant usage on schema public, auth to authenticated;
grant select, update on public.rls_ownership_probe to authenticated;
create policy "owner reads" on public.rls_ownership_probe
  for select to authenticated using (auth.uid() = user_id);
-- Matches production: UPDATE has USING but no explicit WITH CHECK.
create policy "owner updates" on public.rls_ownership_probe
  for update to authenticated using (auth.uid() = user_id);
insert into public.rls_ownership_probe values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','original');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
begin
  -- A malicious attempt to change ownership must fail under the implicit
  -- WITH CHECK inherited from USING. Catch the expected policy error.
  begin
    update public.rls_ownership_probe
       set user_id='00000000-0000-0000-0000-000000000002'
     where id='00000000-0000-0000-0000-000000000011';
    raise exception 'Ownership reassignment was unexpectedly accepted';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
do $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.rls_ownership_probe
   where id='00000000-0000-0000-0000-000000000011';
  if owner_id <> '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'Owner changed despite RLS';
  end if;
end $$;
rollback;
\echo Implicit WITH CHECK ownership protection verified
