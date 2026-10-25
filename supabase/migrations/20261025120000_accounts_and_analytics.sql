create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update (name) on public.profiles to authenticated;

create policy "People can read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "People can rename themselves" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create table public.admin_emails (
  email text primary key check (email = lower(email))
);

alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;
insert into public.admin_emails (email) values ('elliot@aaenz.no');

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create policy "Admins can see their own row" on public.admins
  for select to authenticated using ((select auth.uid()) = user_id);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create function public.handle_user_saved()
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
      new.raw_user_meta_data ->> 'avatar_url'
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

create trigger on_auth_user_saved
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_user_saved();

insert into public.profiles (id, name, avatar_url)
select id,
  left(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', split_part(email, '@', 1)), 80),
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

insert into public.admins (user_id)
select u.id from auth.users u
join public.admin_emails a on a.email = lower(u.email)
where u.email_confirmed_at is not null
on conflict do nothing;

create table public.analytics_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('pageview', 'event')),
  name text check (char_length(name) <= 64),
  host text not null check (char_length(host) <= 120),
  path text not null check (char_length(path) <= 300),
  referrer text check (char_length(referrer) <= 120),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  country text check (char_length(country) = 2),
  device text check (char_length(device) <= 20),
  browser text check (char_length(browser) <= 40),
  os text check (char_length(os) <= 40),
  visitor text not null check (char_length(visitor) <= 64),
  props jsonb check (octet_length(props::text) <= 2000)
);

create index analytics_events_at on public.analytics_events (at);
create index analytics_events_visitor_at on public.analytics_events (visitor, at);

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;
grant select on public.analytics_events to authenticated;

create policy "Admins can read analytics" on public.analytics_events
  for select to authenticated using ((select public.is_admin()));

create table public.analytics_salts (
  day date primary key,
  salt text not null
);

alter table public.analytics_salts enable row level security;
revoke all on public.analytics_salts from anon, authenticated;

create function public.analytics_salt()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  current_salt text;
begin
  select salt into current_salt from public.analytics_salts where day = today;
  if current_salt is null then
    insert into public.analytics_salts (day, salt)
    values (today, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    on conflict (day) do nothing;
    select salt into current_salt from public.analytics_salts where day = today;
    delete from public.analytics_salts where day < today;
    delete from public.analytics_events where at < now() - interval '13 months';
  end if;
  return current_salt;
end;
$$;

revoke execute on function public.analytics_salt() from public, anon, authenticated;
grant execute on function public.analytics_salt() to service_role;

create function public.analytics_is_dev(host text)
returns boolean
language sql
immutable
as $$
  select host ~ '^(localhost|127\.0\.0\.1|\[::1\])(:|$)';
$$;

create function public.analytics_visits(from_at timestamptz, to_at timestamptz, include_dev boolean)
returns table (
  visitor text,
  started timestamptz,
  ended timestamptz,
  pages bigint,
  entry text,
  referrer text,
  utm_source text,
  utm_campaign text
)
language sql
stable
set search_path = ''
as $$
  with views as (
    select e.visitor, e.at, e.path, e.referrer, e.utm_source, e.utm_campaign
    from public.analytics_events e
    where e.kind = 'pageview' and e.at >= from_at and e.at < to_at
      and (include_dev or not public.analytics_is_dev(e.host))
  ),
  marked as (
    select v.*,
      case when lag(v.at) over w is null or v.at - lag(v.at) over w > interval '30 minutes' then 1 else 0 end as fresh
    from views v
    window w as (partition by v.visitor order by v.at)
  ),
  numbered as (
    select m.*, sum(m.fresh) over (partition by m.visitor order by m.at rows unbounded preceding) as visit
    from marked m
  )
  select n.visitor,
    min(n.at),
    max(n.at),
    count(*),
    (array_agg(n.path order by n.at))[1],
    (array_agg(n.referrer order by n.at))[1],
    (array_agg(n.utm_source order by n.at))[1],
    (array_agg(n.utm_campaign order by n.at))[1]
  from numbered n
  group by n.visitor, n.visit;
$$;

create function public.analytics_totals(from_at timestamptz, to_at timestamptz, include_dev boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with visits as (select * from public.analytics_visits(from_at, to_at, include_dev))
  select jsonb_build_object(
    'visitors', (select count(distinct visitor) from visits),
    'pageviews', (select coalesce(sum(pages), 0) from visits),
    'visits', (select count(*) from visits),
    'bounce', (select coalesce(avg((pages = 1)::int), 0) from visits),
    'duration', (select coalesce(avg(extract(epoch from ended - started)), 0) from visits)
  );
$$;

create function public.analytics_report(
  from_at timestamptz,
  to_at timestamptz,
  bucket text default 'day',
  include_dev boolean default false
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  tz constant text := 'Europe/Oslo';
  step interval;
begin
  if not public.is_admin() then
    raise exception 'Only admins can read analytics' using errcode = '42501';
  end if;
  if bucket not in ('hour', 'day', 'week', 'month') then
    raise exception 'Unknown bucket %', bucket;
  end if;
  step := ('1 ' || bucket)::interval;

  return (
    with ev as (
      select e.*
      from public.analytics_events e
      where e.at >= from_at and e.at < to_at
        and (include_dev or not public.analytics_is_dev(e.host))
    ),
    views as (select * from ev where kind = 'pageview'),
    visits as (select * from public.analytics_visits(from_at, to_at, include_dev)),
    slots as (
      select s as t
      from generate_series(
        date_trunc(bucket, from_at at time zone tz),
        date_trunc(bucket, (to_at - interval '1 second') at time zone tz),
        step
      ) s
    ),
    counts as (
      select date_trunc(bucket, v.at at time zone tz) as t, count(distinct v.visitor) as visitors, count(*) as pageviews
      from views v
      group by 1
    )
    select jsonb_build_object(
      'totals', public.analytics_totals(from_at, to_at, include_dev),
      'previous', public.analytics_totals(from_at - (to_at - from_at), from_at, include_dev),
      'live', (
        select count(distinct e.visitor)
        from public.analytics_events e
        where e.at > now() - interval '5 minutes' and (include_dev or not public.analytics_is_dev(e.host))
      ),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object(
          't', to_char(s.t, 'YYYY-MM-DD"T"HH24:MI'),
          'visitors', coalesce(c.visitors, 0),
          'pageviews', coalesce(c.pageviews, 0)
        ) order by s.t), '[]'::jsonb)
        from slots s left join counts c on c.t = s.t
      ),
      'pages', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc, x.views desc), '[]'::jsonb)
        from (select path as label, count(distinct visitor) as value, count(*) as views
              from views group by path order by 2 desc, 3 desc limit 12) x
      ),
      'entries', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select entry as label, count(*) as value from visits group by entry order by 2 desc limit 12) x
      ),
      'referrers', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select coalesce(referrer, 'Direct') as label, count(*) as value
              from visits group by 1 order by 2 desc limit 12) x
      ),
      'campaigns', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select utm_source || coalesce(' · ' || utm_campaign, '') as label, count(*) as value
              from visits where utm_source is not null group by 1 order by 2 desc limit 12) x
      ),
      'countries', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select country as label, count(distinct visitor) as value
              from views where country is not null group by 1 order by 2 desc limit 12) x
      ),
      'devices', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select coalesce(device, 'Unknown') as label, count(distinct visitor) as value
              from views group by 1 order by 2 desc limit 12) x
      ),
      'browsers', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select coalesce(browser, 'Unknown') as label, count(distinct visitor) as value
              from views group by 1 order by 2 desc limit 12) x
      ),
      'systems', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select coalesce(os, 'Unknown') as label, count(distinct visitor) as value
              from views group by 1 order by 2 desc limit 12) x
      ),
      'hosts', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select host as label, count(distinct visitor) as value
              from views group by 1 order by 2 desc limit 12) x
      ),
      'events', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
        from (select name as label, count(*) as value, count(distinct visitor) as visitors
              from ev where kind = 'event' and name is not null group by 1 order by 2 desc limit 20) x
      )
    )
  );
end;
$$;

revoke execute on function public.analytics_visits(timestamptz, timestamptz, boolean) from public, anon;
revoke execute on function public.analytics_totals(timestamptz, timestamptz, boolean) from public, anon;
revoke execute on function public.analytics_report(timestamptz, timestamptz, text, boolean) from public, anon;
grant execute on function public.analytics_visits(timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.analytics_totals(timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.analytics_report(timestamptz, timestamptz, text, boolean) to authenticated;
