-- A key's name, what it can do and which workspaces it reaches can change after it's made. Its hash and hint can't,
-- so it stays the same key and agents keep using it. agent_act reads the key on every write, so writes follow a
-- change at once
grant update (name, access, workspaces) on public.agent_keys to authenticated;

create policy "People change their keys" on public.agent_keys
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
