alter table public.suggestions
  add column by_visitor text check (by_visitor ~ '^[uv]:[A-Za-z0-9-]{8,64}$');

create index suggestions_by_visitor on public.suggestions (by_visitor, created_at) where by_visitor is not null;

create function public.page_flag(p jsonb, k text, fallback boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p -> k) = 'boolean' then (p ->> k)::boolean else fallback end;
$$;

create function public.visitor_voter(p_visitor text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    return 'u:' || (select auth.uid())::text;
  end if;
  if p_visitor is null or p_visitor !~ '^v:[A-Za-z0-9-]{8,64}$' then
    raise exception 'Unknown visitor' using errcode = '22023';
  end if;
  return p_visitor;
end;
$$;

revoke execute on function public.visitor_voter(text) from public, anon, authenticated;

create function public.public_roadmap(p_workspace text, p_board text, p_visitor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w public.workspaces;
  b public.boards;
  who text;
  team boolean;
begin
  select * into w from public.workspaces where slug = p_workspace;
  if w.id is null then
    return null;
  end if;
  select * into b from public.boards where workspace_id = w.id and slug = p_board;
  if b.id is null then
    return null;
  end if;
  if not b.roadmap_public then
    return jsonb_build_object('private', true, 'workspace', jsonb_build_object('name', w.name, 'slug', w.slug));
  end if;

  who := case
    when (select auth.uid()) is not null then 'u:' || (select auth.uid())::text
    when p_visitor ~ '^v:[A-Za-z0-9-]{8,64}$' then p_visitor
  end;
  team := public.page_flag(b.page, 'showTeam', false);

  return jsonb_build_object(
    'workspace', jsonb_build_object('name', w.name, 'slug', w.slug, 'sigil', w.sigil, 'tone', w.tone),
    'board', jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'prefix', b.prefix, 'projects', b.projects, 'page', b.page
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', t.number,
        'title', t.title,
        'status', t.status,
        'project', t.project,
        'start_on', t.start_on,
        'due_on', t.due_on,
        'shipped_on', t.shipped_on,
        'description', t.description,
        'subtasks', (
          select coalesce(jsonb_agg(jsonb_build_object('id', s -> 'id', 'done', coalesce(s -> 'done', 'false'))), '[]')
          from jsonb_array_elements(t.subtasks) s
        ),
        'votes', t.vote_count,
        'voted', who is not null and exists (
          select 1 from public.task_votes v where v.board_id = t.board_id and v.number = t.number and v.voter = who
        ),
        'assignee', case when team and p.id is not null then
          jsonb_build_object('id', p.id, 'name', coalesce(p.name, 'Member'), 'avatar', p.avatar_url)
        end
      ) order by t.position, t.number)
      from public.tasks t
      left join public.profiles p on p.id = t.assignee
      where t.board_id = b.id and t.public and t.deleted_at is null
    ), '[]'),
    'suggestions', case when public.page_flag(b.page, 'ideasPublic', true) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'details', s.details,
        'by', s.by_name,
        'at', s.created_at,
        'votes', s.vote_count,
        'voted', who is not null and exists (
          select 1 from public.suggestion_votes v where v.suggestion_id = s.id and v.voter = who
        )
      ) order by s.vote_count desc, s.created_at desc)
      from (
        select * from public.suggestions where board_id = b.id order by vote_count desc, created_at desc limit 200
      ) s
    ), '[]') else '[]' end
  );
end;
$$;

revoke execute on function public.public_roadmap(text, text, text) from public;
grant execute on function public.public_roadmap(text, text, text) to anon, authenticated;

create function public.public_vote(p_board uuid, p_number int, p_visitor text, p_on boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text := public.visitor_voter(p_visitor);
begin
  if not exists (
    select 1 from public.boards b join public.tasks t on t.board_id = b.id
    where b.id = p_board and b.roadmap_public and public.page_flag(b.page, 'voting', true)
      and t.number = p_number and t.public and t.deleted_at is null
  ) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.task_votes (board_id, number, voter) values (p_board, p_number, who) on conflict do nothing;
  else
    delete from public.task_votes where board_id = p_board and number = p_number and voter = who;
  end if;
  return (select vote_count from public.tasks where board_id = p_board and number = p_number);
end;
$$;

revoke execute on function public.public_vote(uuid, int, text, boolean) from public;
grant execute on function public.public_vote(uuid, int, text, boolean) to anon, authenticated;

create function public.public_suggest(p_board uuid, p_id uuid, p_title text, p_details text, p_visitor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text := public.visitor_voter(p_visitor);
  my_name text;
  s public.suggestions;
begin
  if not exists (
    select 1 from public.boards
    where id = p_board and roadmap_public and public.page_flag(page, 'ideas', true)
  ) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.suggestions where by_visitor = who and created_at > now() - interval '1 day') >= 10
    or (select count(*) from public.suggestions where board_id = p_board and created_at > now() - interval '1 day') >= 300
  then
    raise exception 'Too many today' using errcode = 'PT429';
  end if;
  if (select auth.uid()) is not null then
    select name into my_name from public.profiles where id = (select auth.uid());
  end if;

  insert into public.suggestions (id, board_id, title, details, by_name, by_visitor)
  values (
    p_id, p_board, left(btrim(p_title), 200), nullif(left(btrim(coalesce(p_details, '')), 2000), ''),
    coalesce(nullif(left(btrim(my_name), 60), ''), 'A visitor'), who
  )
  on conflict (id) do nothing
  returning * into s;
  if s.id is null then
    return null;
  end if;
  insert into public.suggestion_votes (suggestion_id, voter) values (s.id, who) on conflict do nothing;
  return jsonb_build_object('id', s.id, 'by', s.by_name, 'at', s.created_at, 'votes', 1);
end;
$$;

revoke execute on function public.public_suggest(uuid, uuid, text, text, text) from public;
grant execute on function public.public_suggest(uuid, uuid, text, text, text) to anon, authenticated;

create function public.public_vote_suggestion(p_suggestion uuid, p_visitor text, p_on boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text := public.visitor_voter(p_visitor);
begin
  if not exists (
    select 1 from public.suggestions s join public.boards b on b.id = s.board_id
    where s.id = p_suggestion and b.roadmap_public
      and public.page_flag(b.page, 'voting', true) and public.page_flag(b.page, 'ideasPublic', true)
  ) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.suggestion_votes (suggestion_id, voter) values (p_suggestion, who) on conflict do nothing;
  else
    delete from public.suggestion_votes where suggestion_id = p_suggestion and voter = who;
  end if;
  return (select vote_count from public.suggestions where id = p_suggestion);
end;
$$;

revoke execute on function public.public_vote_suggestion(uuid, text, boolean) from public;
grant execute on function public.public_vote_suggestion(uuid, text, boolean) to anon, authenticated;
