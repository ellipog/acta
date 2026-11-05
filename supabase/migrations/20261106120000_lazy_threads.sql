-- A board now comes with each task's comment count and latest activity line, and a task's dialog reads its thread
-- when it opens. The indexes from the performance migration already serve those reads: a task's thread in order
-- (comments_task_thread), its latest activity (activity_task_recent) and a board's latest activity for the Inbox
-- (activity_board_recent), so none are added here.
--
-- Moving to a board the browser already holds now catches up on what changed since, instead of the server sending
-- the whole board again. Comments and activity lines are deleted outright, which leaves nothing to catch up on, so a
-- deleted one now leaves its id and its task here for a day. Ideas already leave theirs in declined_suggestions
create table public.removed_lines (
  id uuid primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  number int not null,
  kind text not null check (kind in ('comment', 'activity')),
  removed_at timestamptz not null default now()
);

create index removed_lines_board on public.removed_lines (board_id, removed_at);

alter table public.removed_lines enable row level security;
revoke all on public.removed_lines from anon, authenticated;
grant select on public.removed_lines to authenticated;
grant select, insert, update, delete on public.removed_lines to service_role;

create policy "Members see what was removed" on public.removed_lines
  for select to authenticated using (board_id in (select public.my_board_ids()));

-- A task or board that's deleted takes its lines with it, and there's no one left to tell. The board's traces older
-- than a day go as a new one comes, as the browser reads a board again whole once it's been away that long. A line
-- an undo brings back keeps its id, so the newer trace replaces the older one
create function public.log_line_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tasks where board_id = old.board_id and number = old.number) then
    return null;
  end if;
  delete from public.removed_lines where board_id = old.board_id and removed_at < now() - interval '1 day';
  insert into public.removed_lines (id, board_id, number, kind)
  values (old.id, old.board_id, old.number, tg_argv[0])
  on conflict (id) do update
    set board_id = excluded.board_id, number = excluded.number, kind = excluded.kind, removed_at = excluded.removed_at;
  return null;
end;
$$;

create trigger comments_log_removed after delete on public.comments
  for each row execute function public.log_line_removed('comment');

create trigger activity_log_removed after delete on public.activity
  for each row execute function public.log_line_removed('activity');
