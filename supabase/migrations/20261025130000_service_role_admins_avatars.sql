grant select, insert, update, delete on public.profiles, public.admins, public.admin_emails, public.analytics_events to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;

create function public.sync_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.admins a
  using auth.users u
  where a.user_id = u.id
    and not exists (select 1 from public.admin_emails e where e.email = lower(u.email));

  insert into public.admins (user_id)
  select u.id
  from auth.users u
  join public.admin_emails e on e.email = lower(u.email)
  where u.email_confirmed_at is not null
  on conflict do nothing;

  return null;
end;
$$;

create trigger on_admin_emails_changed
  after insert or update or delete on public.admin_emails
  for each statement execute function public.sync_admins();

create function public.trusted_avatar(url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when url ~ '^https://(avatars\.githubusercontent\.com|lh3\.googleusercontent\.com)/' then url end;
$$;

create or replace function public.handle_user_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, name, avatar_url)
    values (
      new.id,
      left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 80),
      public.trusted_avatar(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'))
    )
    on conflict (id) do nothing;
  end if;

  if new.email_confirmed_at is not null
    and exists (select 1 from public.admin_emails where email = lower(new.email)) then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  else
    delete from public.admins where user_id = new.id;
  end if;

  return new;
end;
$$;

update public.profiles set avatar_url = public.trusted_avatar(avatar_url)
where avatar_url is not null and avatar_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/';

alter table public.profiles add constraint profiles_avatar_url_trusted check (
  avatar_url ~ '^https://(avatars\.githubusercontent\.com|lh3\.googleusercontent\.com|[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars)/'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
