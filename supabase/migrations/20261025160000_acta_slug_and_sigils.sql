alter table public.workspaces drop constraint workspaces_slug_check;
alter table public.workspaces add constraint workspaces_slug_check check (public.slug_ok(slug) or slug = 'acta');

create function public.guard_house_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug = 'acta' and (tg_op = 'INSERT' or old.slug is distinct from new.slug) and (select auth.uid()) is not null then
    raise exception 'That name is reserved' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger workspaces_house_slug before insert or update of slug on public.workspaces
  for each row execute function public.guard_house_slug();

update public.workspaces set sigil = 'crystal-rhomb' where sigil = 'geode';

create or replace function public.create_workspace(p_name text, p_slug text, p_board_name text, p_board_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ws uuid;
  tones text[] := array['lapis', 'pyrite', 'malachite', 'hematite'];
  sigils text[] := array[
    'crystal-block', 'crystal-cluster', 'crystal-column', 'crystal-lozenge', 'crystal-prism',
    'crystal-rhomb', 'crystal-shard', 'crystal-tablet', 'crystal-tower'
  ];
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if (select count(*) from public.members where user_id = me and role = 'owner') >= 20 then
    raise exception 'You can own up to 20 workspaces' using errcode = 'P0001';
  end if;

  insert into public.workspaces (slug, name, created_by, tone, sigil)
  values (
    p_slug,
    btrim(p_name),
    me,
    tones[1 + floor(random() * array_length(tones, 1))::int],
    sigils[1 + floor(random() * array_length(sigils, 1))::int]
  )
  returning id into ws;

  insert into public.members (workspace_id, user_id, role) values (ws, me, 'owner');
  insert into public.workspace_links (workspace_id) values (ws);
  insert into public.boards (workspace_id, slug, name, prefix, created_by)
  values (ws, p_board_slug, btrim(p_board_name), public.board_prefix(p_board_name), me);

  return jsonb_build_object('workspace', p_slug, 'board', p_board_slug);
end;
$$;
