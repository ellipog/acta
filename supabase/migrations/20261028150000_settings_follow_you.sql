-- Settings that follow a person from one device to the next: the order of the boards in their sidebar, and how
-- each board looks to them (its view, columns, grouping, sort and saved filters). The browser keeps its own copy,
-- so a board opens with them at once, and reads this in the background to pick up what changed elsewhere
create table public.user_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[a-z]+-[0-9a-f-]{36}$'),
  value jsonb not null check (octet_length(value::text) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_prefs enable row level security;
revoke all on public.user_prefs from anon, authenticated;
grant select, insert, update, delete on public.user_prefs to authenticated;

create policy "People keep their own settings" on public.user_prefs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The server's clock decides which copy is newer, and nobody keeps more than a few hundred
create function public.stamp_user_pref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and (select count(*) from public.user_prefs where user_id = new.user_id) >= 500 then
    raise exception 'Too many saved settings';
  end if;
  return new;
end;
$$;

create trigger stamp_user_pref before insert or update on public.user_prefs
  for each row execute function public.stamp_user_pref();
