-- Agent keys let AI agents work in Acta as the person who made them, through the MCP endpoint.
-- Only a hash of each key is stored. Access is read, write or manage, optionally limited to some workspaces
create table public.agent_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  access text not null check (access in ('read', 'write', 'manage')),
  workspaces uuid[] check (workspaces is null or cardinality(workspaces) between 1 and 50),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  hint text not null check (char_length(hint) between 1 and 8),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index agent_keys_user on public.agent_keys (user_id);

alter table public.agent_keys enable row level security;
revoke all on public.agent_keys from anon, authenticated;
grant select (id, name, access, workspaces, hint, created_at, used_at), delete on public.agent_keys to authenticated;
grant insert (name, access, workspaces, hash, hint) on public.agent_keys to authenticated;
grant select, insert, update, delete on public.agent_keys to service_role;

create policy "People see their keys" on public.agent_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "People make keys" on public.agent_keys
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "People revoke keys" on public.agent_keys
  for delete to authenticated using (user_id = (select auth.uid()));

-- Which key a comment or activity entry came through. Set only inside agent_act, so people's own edits stay null
alter table public.comments add column via text check (char_length(via) <= 40);
alter table public.activity add column via text check (char_length(via) <= 40);
alter table public.comments alter column via set default nullif(current_setting('acta.via', true), '');
alter table public.activity alter column via set default nullif(current_setting('acta.via', true), '');

-- Checks the key and takes on its owner's identity for the rest of the transaction, so auth.uid(), the
-- membership checks and the column defaults all behave as if that person made the change
create function public.agent_act(p_key text, p_need text, p_workspace uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.agent_keys;
  rank jsonb := '{"read": 1, "write": 2, "manage": 3}';
begin
  select * into k from public.agent_keys where hash = p_key;
  if k.id is null then
    raise exception 'This key doesn’t work any more' using errcode = '28000';
  end if;
  if (rank ->> k.access)::int < (rank ->> p_need)::int then
    raise exception 'This key can’t make that change' using errcode = '42501';
  end if;
  if k.workspaces is not null and not (p_workspace = any (k.workspaces)) then
    raise exception 'This key can’t reach that workspace' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', k.user_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', k.user_id, 'role', 'authenticated')::text, true);
  perform set_config('acta.via', k.name, true);

  if not public.is_member(p_workspace) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return k.user_id;
end;
$$;

-- Task changes go through the same function the app uses. Board settings and suggestion triage need manage,
-- and the parts that act on someone's own votes or comments aren't open to agents
create function public.agent_apply(p_key text, p_board uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.boards where id = p_board;
  if ws is null then
    raise exception 'No such board' using errcode = 'P0002';
  end if;
  perform public.agent_act(p_key, case when p_changes ?| array['board', 'declined'] then 'manage' else 'write' end, ws);
  return public.apply_board_changes(
    p_board,
    p_changes - array['uncomments', 'unactivity', 'voted', 'unvoted', 'suggested', 'suggestionVoted', 'suggestionUnvoted']
  );
end;
$$;

-- Creates a board (p_board null) or renames it and changes its labels and projects
create function public.agent_board(p_key text, p_workspace uuid, p_board uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.agent_act(p_key, 'manage', p_workspace);
  b public.boards;
begin
  if p_board is null then
    insert into public.boards (workspace_id, slug, name, prefix, created_by)
    values (p_workspace, p_fields ->> 'slug', btrim(p_fields ->> 'name'), public.board_prefix(p_fields ->> 'name'), me)
    returning * into b;
  else
    update public.boards set
      name = case when p_fields ? 'name' then btrim(p_fields ->> 'name') else name end,
      labels = case when p_fields ? 'labels' then p_fields -> 'labels' else labels end,
      projects = case when p_fields ? 'projects' then p_fields -> 'projects' else projects end
    where id = p_board and workspace_id = p_workspace
    returning * into b;
    if b.id is null then
      raise exception 'No such board' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'prefix', b.prefix);
end;
$$;

revoke execute on function public.agent_act(text, text, uuid), public.agent_apply(text, uuid, jsonb),
  public.agent_board(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.agent_apply(text, uuid, jsonb), public.agent_board(text, uuid, uuid, jsonb)
  to service_role;
