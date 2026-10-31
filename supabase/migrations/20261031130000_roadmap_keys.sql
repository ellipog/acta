-- Roadmap keys build a board's public roadmap into another site, through /api/roadmap/v1. Each belongs to one board
-- and reaches only what its public page shows, so it is a publishable key: made to sit in a site's code where anyone
-- can read it, like the page itself. That's why the key is kept as it is, to show again, rather than as a hash.
-- Rotating swaps it for a new one, and revoking deletes it. They're apart from agent keys, which act as a person
create function public.roadmap_origins_ok(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p) <= 10 and coalesce(bool_and(o ~ '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$'), true)
  from unnest(p) o;
$$;

create table public.roadmap_keys (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  token text not null unique check (token ~ '^acta_pk_[A-Za-z0-9_-]{24,64}$'),
  -- The sites whose pages may call it from a browser. Empty lets any site
  origins text[] not null default '{}' check (public.roadmap_origins_ok(origins)),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  used_at timestamptz
);

create index roadmap_keys_board on public.roadmap_keys (board_id);

alter table public.roadmap_keys enable row level security;
revoke all on public.roadmap_keys from anon, authenticated;
grant select (id, board_id, name, token, origins, created_at, rotated_at, used_at), delete on public.roadmap_keys
  to authenticated;
grant update (name, origins) on public.roadmap_keys to authenticated;
grant select, insert, update, delete on public.roadmap_keys to service_role;

-- Whoever may change the public roadmap may manage its keys
create policy "Roadmap keepers see its keys" on public.roadmap_keys
  for select to authenticated using (public.board_can(board_id, 'roadmap'));
create policy "Roadmap keepers change its keys" on public.roadmap_keys
  for update to authenticated
  using (public.board_can(board_id, 'roadmap')) with check (public.board_can(board_id, 'roadmap'));
create policy "Roadmap keepers revoke its keys" on public.roadmap_keys
  for delete to authenticated using (public.board_can(board_id, 'roadmap'));

create function public.roadmap_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'acta_pk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

create function public.create_roadmap_key(p_board uuid, p_name text, p_origins text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.roadmap_keys;
begin
  if not public.board_can(p_board, 'roadmap') then
    raise exception 'You can’t change the public roadmap here' using errcode = '42501';
  end if;
  if (select count(*) from public.roadmap_keys where board_id = p_board) >= 10 then
    raise exception 'A board can have 10 roadmap keys' using errcode = '54000';
  end if;
  insert into public.roadmap_keys (board_id, name, token, origins, created_by)
  values (p_board, btrim(p_name), public.roadmap_token(), coalesce(p_origins, '{}'), (select auth.uid()))
  returning * into k;
  return jsonb_build_object(
    'id', k.id, 'name', k.name, 'token', k.token, 'origins', to_jsonb(k.origins), 'created_at', k.created_at
  );
end;
$$;

create function public.rotate_roadmap_key(p_key uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  fresh text := public.roadmap_token();
begin
  update public.roadmap_keys set token = fresh, rotated_at = now()
  where id = p_key and public.board_can(board_id, 'roadmap');
  if not found then
    raise exception 'No such key' using errcode = 'P0002';
  end if;
  return fresh;
end;
$$;

revoke execute on function public.create_roadmap_key(uuid, text, text[]), public.rotate_roadmap_key(uuid)
  from public, anon;
grant execute on function public.create_roadmap_key(uuid, text, text[]), public.rotate_roadmap_key(uuid)
  to authenticated;
revoke execute on function public.roadmap_token() from public, anon, authenticated;

-- Calls per minute, by key and by caller. The caller is a hash of their address, never the address itself
create table public.roadmap_key_hits (
  key_id uuid not null references public.roadmap_keys (id) on delete cascade,
  who text not null check (char_length(who) <= 64),
  minute timestamptz not null,
  reads int not null default 0,
  writes int not null default 0,
  primary key (key_id, who, minute)
);

alter table public.roadmap_key_hits enable row level security;
revoke all on public.roadmap_key_hits from anon, authenticated;
grant select, insert, update, delete on public.roadmap_key_hits to service_role;

-- Checks a key and counts the call. Returns null for a key that doesn't work, and otherwise the board it reaches
-- and whether this call is within the limits: 240 reads and 30 writes a minute from each caller
create function public.use_roadmap_key(p_token text, p_who text, p_write boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.roadmap_keys;
  b public.boards;
  ws text;
  m timestamptz := date_trunc('minute', now());
  hits int;
begin
  select * into k from public.roadmap_keys where token = p_token;
  if k.id is null then
    return null;
  end if;
  select * into b from public.boards where id = k.board_id;
  select slug into ws from public.workspaces where id = b.workspace_id;

  insert into public.roadmap_key_hits as h (key_id, who, minute, reads, writes)
  values (k.id, left(p_who, 64), m, case when p_write then 0 else 1 end, case when p_write then 1 else 0 end)
  on conflict (key_id, who, minute) do update set reads = h.reads + excluded.reads, writes = h.writes + excluded.writes
  returning case when p_write then h.writes else h.reads end into hits;

  -- Now and then, the minutes that no longer count go
  if random() < 0.02 then
    delete from public.roadmap_key_hits where minute < now() - interval '5 minutes';
  end if;
  if k.used_at is null or k.used_at < now() - interval '10 minutes' then
    update public.roadmap_keys set used_at = now() where id = k.id;
  end if;

  return jsonb_build_object(
    'key', k.id,
    'board', b.id,
    'workspace_slug', ws,
    'board_slug', b.slug,
    'prefix', b.prefix,
    'origins', to_jsonb(k.origins),
    'allowed', hits <= case when p_write then 30 else 240 end,
    'retry_after', 60 - floor(extract(second from now()))::int
  );
end;
$$;

revoke execute on function public.use_roadmap_key(text, text, boolean) from public, anon, authenticated;
grant execute on function public.use_roadmap_key(text, text, boolean) to service_role;
