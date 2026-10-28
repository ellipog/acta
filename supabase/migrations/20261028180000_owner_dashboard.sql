-- The owner's dashboard: how many people use Acta, how much they do, whether they come back, and what they use.
-- Everything is counted here and only totals leave the database. Admins only. The admins' own accounts
-- can be left out, so the owner's work on their own boards doesn't drown out everyone else's

create function public.owner_report(
  from_at timestamptz,
  to_at timestamptz,
  bucket text default 'day',
  include_me boolean default false,
  site_host text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz constant text := 'Europe/Oslo';
  step interval;
begin
  if not public.is_admin() then
    raise exception 'Only admins can read this' using errcode = '42501';
  end if;
  if bucket not in ('day', 'week', 'month') then
    raise exception 'Unknown bucket %', bucket;
  end if;
  -- All time starts with the first account, in days, weeks or months depending on how long ago that was
  if from_at is null then
    from_at := coalesce((select min(created_at) from public.profiles), now() - interval '30 days');
    bucket := case when to_at - from_at <= interval '62 days' then 'day'
      when to_at - from_at <= interval '730 days' then 'week' else 'month' end;
  end if;
  step := ('1 ' || bucket)::interval;

  return (
    with me as (
      select u.id from auth.users u join public.admin_emails a on a.email = lower(u.email) where not include_me
    ),
    people as (select p.id, p.created_at from public.profiles p where p.id not in (select id from me)),
    -- Anything someone did: a change to a task or a comment, by hand, through an agent or from GitHub
    acts as (
      select a.actor as who, a.created_at as at, a.via, a.board_id
      from public.activity a
      where a.actor is not null and a.actor not in (select id from me)
      union all
      select c.author, c.created_at, c.via, c.board_id
      from public.comments c
      where c.author is not null and c.author not in (select id from me)
    ),
    spaces as (
      select w.* from public.workspaces w where w.created_by is null or w.created_by not in (select id from me)
    ),
    boards as (select b.* from public.boards b join spaces w on w.id = b.workspace_id),
    work as (
      select t.* from public.tasks t
      where t.deleted_at is null and (t.created_by is null or t.created_by not in (select id from me))
    ),
    slots as (
      select s as t
      from generate_series(
        date_trunc(bucket, from_at at time zone tz),
        date_trunc(bucket, (to_at - interval '1 second') at time zone tz),
        step
      ) s
    ),
    weeks as (
      select generate_series(
        date_trunc('week', now() at time zone tz) - interval '7 weeks',
        date_trunc('week', now() at time zone tz),
        interval '1 week'
      ) as w
    )
    select jsonb_build_object(
      'bucket', bucket,
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object(
          't', to_char(s.t, 'YYYY-MM-DD"T"HH24:MI'),
          'signups', (select count(*) from people p where date_trunc(bucket, p.created_at at time zone tz) = s.t),
          'users', (select count(*) from people p where p.created_at < (s.t + step) at time zone tz),
          'active', (select count(distinct a.who) from acts a where date_trunc(bucket, a.at at time zone tz) = s.t),
          'created', (select count(*) from work t where date_trunc(bucket, t.created_at at time zone tz) = s.t),
          'done', (select count(*) from work t where t.status = 'done' and date_trunc(bucket, t.shipped_on::timestamp) = s.t),
          'byPeople', (select count(*) from acts a where a.via is null and date_trunc(bucket, a.at at time zone tz) = s.t),
          'byAgents', (
            select count(*) from acts a
            where a.via is not null and a.via <> 'GitHub' and date_trunc(bucket, a.at at time zone tz) = s.t
          ),
          'byGitHub', (select count(*) from acts a where a.via = 'GitHub' and date_trunc(bucket, a.at at time zone tz) = s.t)
        ) order by s.t), '[]'::jsonb)
        from slots s
      ),
      'users', jsonb_build_object(
        'total', (select count(*) from people),
        'new', (select count(*) from people where created_at >= from_at and created_at < to_at),
        'newBefore', (select count(*) from people where created_at >= from_at - (to_at - from_at) and created_at < from_at),
        'daily', (select count(distinct who) from acts where at > now() - interval '1 day'),
        'weekly', (select count(distinct who) from acts where at > now() - interval '7 days'),
        'monthly', (select count(distinct who) from acts where at > now() - interval '30 days'),
        'activeBefore', (
          select count(distinct who) from acts where at >= from_at - (to_at - from_at) and at < from_at
        ),
        'active', (select count(distinct who) from acts where at >= from_at and at < to_at),
        'methods', (
          select coalesce(jsonb_agg(jsonb_build_object('label', x.provider, 'value', x.n) order by x.n desc), '[]'::jsonb)
          from (
            select i.provider, count(distinct i.user_id) as n
            from auth.identities i
            where i.user_id not in (select id from me)
            group by i.provider
          ) x
        ),
        'joined', (
          select count(*)
          from public.members m join spaces w on w.id = m.workspace_id
          where m.user_id is distinct from w.created_by and m.user_id not in (select id from me)
            and m.created_at >= from_at and m.created_at < to_at
        )
      ),
      'cohorts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'week', to_char(c.w, 'YYYY-MM-DD'),
          'size', c.size,
          'weeks', c.back
        ) order by c.w), '[]'::jsonb)
        from (
          select wk.w,
            (select count(*) from people p where date_trunc('week', p.created_at at time zone tz) = wk.w) as size,
            (
              select coalesce(jsonb_agg(
                (
                  select count(distinct a.who)
                  from acts a join people p on p.id = a.who
                  where date_trunc('week', p.created_at at time zone tz) = wk.w
                    and date_trunc('week', a.at at time zone tz) = later.w
                ) order by later.w
              ), '[]'::jsonb)
              from weeks later where later.w >= wk.w
            ) as back
          from weeks wk
        ) c
      ),
      'workspaces', jsonb_build_object(
        'total', (select count(*) from spaces),
        'new', (select count(*) from spaces where created_at >= from_at and created_at < to_at),
        'shared', (
          select count(*) from spaces w where (select count(*) from public.members m where m.workspace_id = w.id) > 1
        ),
        'active', (
          select count(distinct b.workspace_id)
          from acts a join boards b on b.id = a.board_id
          where a.at > now() - interval '7 days'
        ),
        'members', (
          select coalesce(round(avg(n), 1), 0)
          from (select count(*) as n from public.members m join spaces w on w.id = m.workspace_id group by w.id) x
        ),
        'boards', (select count(*) from boards),
        'tasksPerBoard', (
          select coalesce(percentile_disc(0.5) within group (order by n), 0)
          from (select count(t.number) as n from boards b left join work t on t.board_id = b.id group by b.id) x
        ),
        'busiest', (
          select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
          from (
            select w.name || ' / ' || b.name as label, count(*) as value
            from acts a join boards b on b.id = a.board_id join spaces w on w.id = b.workspace_id
            where a.at >= from_at and a.at < to_at
            group by w.name, b.name
            order by 2 desc
            limit 8
          ) x
        )
      ),
      'tasks', jsonb_build_object(
        'total', (select count(*) from work),
        'open', (select count(*) from work where status not in ('done', 'canceled')),
        'created', (select count(*) from work where created_at >= from_at and created_at < to_at),
        'createdBefore', (
          select count(*) from work where created_at >= from_at - (to_at - from_at) and created_at < from_at
        ),
        'done', (
          select count(*) from work
          where status = 'done' and shipped_on >= (from_at at time zone tz)::date and shipped_on < (to_at at time zone tz)::date + 1
        ),
        'doneBefore', (
          select count(*) from work
          where status = 'done' and shipped_on >= ((from_at - (to_at - from_at)) at time zone tz)::date
            and shipped_on < (from_at at time zone tz)::date
        ),
        'canceled', (
          select count(*) from work where status = 'canceled' and updated_at >= from_at and updated_at < to_at
        ),
        'daysToDone', (
          select coalesce(percentile_cont(0.5) within group (order by shipped_on - (created_at at time zone tz)::date), 0)
          from work
          where status = 'done' and shipped_on >= (from_at at time zone tz)::date
            and shipped_on < (to_at at time zone tz)::date + 1
        ),
        'comments', (
          select count(*) from public.comments c
          where c.created_at >= from_at and c.created_at < to_at and (c.author is null or c.author not in (select id from me))
        )
      ),
      'agents', jsonb_build_object(
        'keys', (select count(*) from public.agent_keys k where k.user_id not in (select id from me)),
        'newKeys', (
          select count(*) from public.agent_keys k
          where k.user_id not in (select id from me) and k.created_at >= from_at and k.created_at < to_at
        ),
        'usedKeys', (
          select count(*) from public.agent_keys k
          where k.user_id not in (select id from me) and k.used_at > now() - interval '7 days'
        ),
        'edits', (
          select count(*) from acts where via is not null and via <> 'GitHub' and at >= from_at and at < to_at
        ),
        'allEdits', (select count(*) from acts where at >= from_at and at < to_at),
        'github', (select count(*) from acts where via = 'GitHub' and at >= from_at and at < to_at),
        'names', (
          select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]'::jsonb)
          from (
            select via as label, count(*) as value from acts
            where via is not null and via <> 'GitHub' and at >= from_at and at < to_at
            group by via order by 2 desc limit 8
          ) x
        )
      ),
      'roadmaps', jsonb_build_object(
        'published', (select count(*) from boards where roadmap_public),
        'votes', (
          select count(*) from public.task_votes v join boards b on b.id = v.board_id
          where v.created_at >= from_at and v.created_at < to_at
        ),
        'ideas', (
          select count(*) from public.suggestions s join boards b on b.id = s.board_id
          where s.created_at >= from_at and s.created_at < to_at
        ),
        'visitors', (
          select count(distinct e.visitor) from public.analytics_events e
          where e.at >= from_at and e.at < to_at and e.kind = 'pageview' and not public.analytics_is_dev(e.host)
            and (e.path like '/p/%' or (site_host <> '' and e.host not in (site_host, 'www.' || site_host)))
        )
      ),
      -- Each browser's latest look in the range, from the appearance event the app sends once a day
      'appearance', (
        with latest as (
          select distinct on (e.visitor) e.props
          from public.analytics_events e
          where e.kind = 'event' and e.name = 'appearance' and e.at >= from_at and e.at < to_at
            and not public.analytics_is_dev(e.host)
          order by e.visitor, e.at desc
        )
        select jsonb_build_object(
          'browsers', (select count(*) from latest),
          'theme', (
            select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc), '[]'::jsonb)
            from (select props ->> 'theme' as k, count(*) as n from latest where props ? 'theme' group by 1) x
          ),
          'icons', (
            select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc), '[]'::jsonb)
            from (select props ->> 'icons' as k, count(*) as n from latest where props ? 'icons' group by 1) x
          ),
          'accent', (
            select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc), '[]'::jsonb)
            from (select props ->> 'accent' as k, count(*) as n from latest where props ? 'accent' group by 1) x
          )
        )
      )
    )
  );
end;
$$;

revoke execute on function public.owner_report(timestamptz, timestamptz, text, boolean, text) from public, anon;
grant execute on function public.owner_report(timestamptz, timestamptz, text, boolean, text) to authenticated;
