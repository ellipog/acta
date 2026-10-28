-- Deleting a task and declining an idea used to leave nothing behind, so afterwards there was no telling who did
-- either, or that it happened at all. A task that's deleted or brought back now gets a line in its activity, made
-- here so it's there however the change came in. A declined idea is kept in declined_suggestions, with who
-- declined it and through which key
create function public.log_task_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.deleted_at is null) = (old.deleted_at is null) then
    return null;
  end if;
  insert into public.activity (board_id, number, actor, text)
  values (
    new.board_id, new.number, (select auth.uid()),
    case when new.deleted_at is null then 'restored the task' else 'deleted the task' end
  );
  return null;
end;
$$;

create trigger tasks_log_delete after update of deleted_at on public.tasks
  for each row execute function public.log_task_deleted();

create table public.declined_suggestions (
  id uuid primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  title text not null,
  details text,
  by_name text not null,
  votes int not null default 0,
  created_at timestamptz not null,
  declined_at timestamptz not null default now(),
  declined_by uuid references public.profiles (id) on delete set null,
  via text
);

create index declined_suggestions_board on public.declined_suggestions (board_id, declined_at desc);

alter table public.declined_suggestions enable row level security;
revoke all on public.declined_suggestions from anon, authenticated;
grant select on public.declined_suggestions to authenticated;
grant select, insert, update, delete on public.declined_suggestions to service_role;

create policy "Members see declined ideas" on public.declined_suggestions
  for select to authenticated using (public.can_edit_board(board_id));

-- Accepting an idea removes it too, but it lives on as a task that remembers it. A board that's being deleted
-- takes its ideas with it, and there's nothing left to keep them for
create function public.log_suggestion_declined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tasks where board_id = old.board_id and origin = old.id)
    or not exists (select 1 from public.boards where id = old.board_id) then
    return old;
  end if;
  insert into public.declined_suggestions (id, board_id, title, details, by_name, votes, created_at, declined_by, via)
  values (
    old.id, old.board_id, old.title, old.details, old.by_name, old.vote_count, old.created_at, (select auth.uid()),
    nullif(current_setting('acta.via', true), '')
  )
  on conflict (id) do nothing;
  return old;
end;
$$;

create trigger suggestions_log_decline before delete on public.suggestions
  for each row execute function public.log_suggestion_declined();
