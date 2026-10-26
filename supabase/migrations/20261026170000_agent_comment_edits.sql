-- Which key wrote a comment, so that key, and only that key, can edit it later. Revoking the key ends that
alter table public.comments add column agent_key uuid references public.agent_keys (id) on delete set null;
alter table public.comments alter column agent_key set default nullif(current_setting('acta.key', true), '')::uuid;

create or replace function public.agent_act(p_key text, p_need text, p_workspace uuid)
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
  perform set_config('acta.key', k.id::text, true);

  if not public.is_member(p_workspace) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return k.user_id;
end;
$$;

create function public.agent_edit_comment(p_key text, p_comment uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments;
  ws uuid;
begin
  select * into c from public.comments where id = p_comment;
  if c.id is null then
    raise exception 'No such comment' using errcode = 'P0002';
  end if;
  select workspace_id into ws from public.boards where id = c.board_id;
  perform public.agent_act(p_key, 'write', ws);
  if c.agent_key is distinct from nullif(current_setting('acta.key', true), '')::uuid then
    raise exception 'A key can only edit comments it wrote' using errcode = '42501';
  end if;
  update public.comments set body = p_body where id = p_comment;
end;
$$;

revoke execute on function public.agent_edit_comment(text, uuid, text) from public, anon, authenticated;
grant execute on function public.agent_edit_comment(text, uuid, text) to service_role;
