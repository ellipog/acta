-- Each board can show its own icon in the sidebar, picked from a short list. Changing it is changing the board
alter table public.boards add column icon text not null default 'board'
  check (icon in ('board', 'folder', 'layers', 'star', 'flag', 'bulb', 'sparkle', 'globe', 'chart', 'users',
                  'shield', 'calendar'));

grant update (icon) on public.boards to authenticated;

create or replace function public.guard_board_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (new.roadmap_public, new.page) is distinct from (old.roadmap_public, old.page)
    and not public.can(old.workspace_id, 'roadmap') then
    raise exception 'You can’t change the public roadmap here' using errcode = '42501';
  end if;
  if (new.name, new.slug, new.labels, new.projects, new.position, new.fields, new.status_names, new.icon)
    is distinct from (old.name, old.slug, old.labels, old.projects, old.position, old.fields, old.status_names, old.icon)
    and not public.can(old.workspace_id, 'boards') then
    raise exception 'You can’t change boards here' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Same as before, and agents can change the icon too
create or replace function public.agent_board(p_key text, p_workspace uuid, p_board uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.agent_act(p_key, 'manage', p_workspace);
  b public.boards;
begin
  if not public.can(p_workspace, 'boards') then
    raise exception 'You can’t create or change boards here' using errcode = '42501';
  end if;
  if p_board is null then
    insert into public.boards (workspace_id, slug, name, prefix, created_by)
    values (p_workspace, p_fields ->> 'slug', btrim(p_fields ->> 'name'), public.board_prefix(p_fields ->> 'name'), me)
    returning * into b;
  else
    update public.boards set
      name = case when p_fields ? 'name' then btrim(p_fields ->> 'name') else name end,
      labels = case when p_fields ? 'labels' then p_fields -> 'labels' else labels end,
      projects = case when p_fields ? 'projects' then p_fields -> 'projects' else projects end,
      fields = case when p_fields ? 'fields' then p_fields -> 'fields' else fields end,
      status_names = case when p_fields ? 'status_names' then p_fields -> 'status_names' else status_names end,
      icon = case when p_fields ? 'icon' then p_fields ->> 'icon' else icon end
    where id = p_board and workspace_id = p_workspace
    returning * into b;
    if b.id is null then
      raise exception 'No such board' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'prefix', b.prefix);
end;
$$;
