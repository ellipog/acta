-- GitHub. A workspace installs the Acta GitHub App, links repositories to its boards, and pull requests, branches,
-- commits and issues then show up on tasks and move them along. Everything here is written by the server, which
-- checks GitHub's signature on each webhook first. People only read it

create table public.github_installations (
  id bigint primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account text not null check (char_length(account) <= 100),
  installed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index github_installations_workspace on public.github_installations (workspace_id);

-- A repository links to one board, so it's always clear where its pull requests and issues belong. A board can
-- link several
create table public.github_repos (
  id bigint primary key,
  installation_id bigint not null references public.github_installations (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  full_name text not null check (char_length(full_name) <= 200),
  private boolean not null default true,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 2000),
  created_at timestamptz not null default now()
);

create index github_repos_board on public.github_repos (board_id);

-- What GitHub has said about a task: its pull requests, issue, branches and commits
create table public.task_links (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  number int not null,
  repo_id bigint not null references public.github_repos (id) on delete cascade,
  kind text not null check (kind in ('pr', 'issue', 'branch', 'commit')),
  -- The pull request or issue number, the branch name or the commit's sha
  ref text not null check (char_length(ref) <= 300),
  url text not null check (char_length(url) <= 500),
  title text check (char_length(title) <= 500),
  -- draft, open, merged or closed
  state text check (char_length(state) <= 20),
  author text check (char_length(author) <= 100),
  -- The pull request says it finishes the task, as in "Fixes ACT-12"
  closes boolean not null default false,
  -- Review and checks for pull requests, and when each side last changed a synced issue's fields
  extra jsonb not null default '{}' check (jsonb_typeof(extra) = 'object' and octet_length(extra::text) <= 4000),
  updated_at timestamptz not null default now(),
  foreign key (board_id, number) references public.tasks (board_id, number) on delete cascade on update cascade,
  unique (board_id, number, repo_id, kind, ref)
);

create index task_links_task on public.task_links (board_id, number);
create index task_links_ref on public.task_links (repo_id, kind, ref);

-- Each webhook delivery once, however often GitHub sends it
create table public.github_deliveries (
  id text primary key check (char_length(id) <= 100),
  received_at timestamptz not null default now()
);

create index github_deliveries_received on public.github_deliveries (received_at);

-- The one comment Acta keeps on each pull request, edited rather than added to
create table public.github_comments (
  repo_id bigint not null references public.github_repos (id) on delete cascade,
  number int not null,
  comment_id bigint not null,
  primary key (repo_id, number)
);

-- Changes made in Acta to tasks that sync with an issue, waiting to go to GitHub
create table public.github_outbox (
  id bigint generated always as identity primary key,
  board_id uuid not null,
  number int not null,
  fields text[] not null,
  created_at timestamptz not null default now()
);

create index github_outbox_board on public.github_outbox (board_id);

alter table public.github_installations enable row level security;
alter table public.github_repos enable row level security;
alter table public.task_links enable row level security;
alter table public.github_deliveries enable row level security;
alter table public.github_comments enable row level security;
alter table public.github_outbox enable row level security;
revoke all on public.github_installations, public.github_repos, public.task_links, public.github_deliveries,
  public.github_comments, public.github_outbox from anon, authenticated;
grant select on public.github_installations, public.github_repos, public.task_links to authenticated;

create policy "Members see their workspace's GitHub" on public.github_installations
  for select to authenticated using (public.is_member(workspace_id));

create policy "Members see linked repositories" on public.github_repos
  for select to authenticated
  using (exists (select 1 from public.boards b where b.id = board_id and public.is_member(b.workspace_id)));

create policy "Members see what GitHub says about tasks" on public.task_links
  for select to authenticated
  using (exists (select 1 from public.boards b where b.id = board_id and public.is_member(b.workspace_id)));

-- GitHub's edits go through the app's own write path, as the person who made them on GitHub when they're a member
-- who may edit, otherwise as whoever connected GitHub. They're marked "via GitHub", and like agents they may keep
-- an imported issue's dates and its comments' authors
create function public.github_apply(p_repo bigint, p_actor uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.github_repos;
  ws uuid;
  installer uuid;
  who uuid;
begin
  select * into r from public.github_repos where id = p_repo;
  if r.id is null then
    raise exception 'That repository isn’t linked to a board' using errcode = 'P0002';
  end if;
  select b.workspace_id, i.installed_by into ws, installer
  from public.boards b
  join public.github_installations i on i.id = r.installation_id and i.workspace_id = b.workspace_id
  where b.id = r.board_id;
  if ws is null then
    raise exception 'That repository isn’t linked to a board' using errcode = 'P0002';
  end if;

  foreach who in array array[p_actor, installer] loop
    continue when who is null;
    perform set_config('request.jwt.claim.sub', who::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', who, 'role', 'authenticated')::text, true);
    exit when public.can(ws, 'edit');
    who := null;
  end loop;
  if who is null then
    raise exception 'Nobody who may edit this board is connected to GitHub' using errcode = '42501';
  end if;

  perform set_config('acta.via', 'GitHub', true);
  perform set_config('acta.key', 'github', true);
  return public.apply_board_changes(
    r.board_id,
    p_changes - array['uncomments', 'unactivity', 'voted', 'unvoted', 'suggested', 'suggestionVoted',
      'suggestionUnvoted', 'deleted', 'board', 'declined']
  );
end;
$$;

-- Which member a GitHub account belongs to, through the GitHub sign-in they linked
create function public.github_member(p_workspace uuid, p_github_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from auth.identities i
  join public.members m on m.user_id = i.user_id and m.workspace_id = p_workspace
  where i.provider = 'github' and i.provider_id = p_github_id
  limit 1;
$$;

revoke execute on function public.github_apply(bigint, uuid, jsonb), public.github_member(uuid, text)
  from public, anon, authenticated;
grant execute on function public.github_apply(bigint, uuid, jsonb), public.github_member(uuid, text) to service_role;

-- A comment's agent key comes from the key acting, which GitHub isn't
create function public.current_agent_key()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.agent_keys where id::text = nullif(current_setting('acta.key', true), '');
$$;

grant execute on function public.current_agent_key() to authenticated, service_role;
alter table public.comments alter column agent_key set default public.current_agent_key();

-- A change made in Acta to a synced issue's title, status or labels waits here for the server to send it to GitHub.
-- GitHub's own changes are left out, so nothing goes round in circles
create function public.queue_github_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[] := '{}';
begin
  if coalesce(current_setting('acta.via', true), '') = 'GitHub' then
    return new;
  end if;
  if new.title is distinct from old.title then changed := array_append(changed, 'title'); end if;
  if new.status is distinct from old.status then changed := array_append(changed, 'status'); end if;
  if new.labels is distinct from old.labels then changed := array_append(changed, 'labels'); end if;
  if cardinality(changed) = 0 or not exists (
    select 1 from public.task_links where board_id = new.board_id and number = new.number and kind = 'issue'
  ) then
    return new;
  end if;
  insert into public.github_outbox (board_id, number, fields) values (new.board_id, new.number, changed);
  return new;
end;
$$;

create trigger queue_github_sync after update of title, status, labels on public.tasks
  for each row execute function public.queue_github_sync();

-- Linked pull requests show up on open tasks as they change
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_links'
  ) then
    alter publication supabase_realtime add table public.task_links;
  end if;
end;
$$;
