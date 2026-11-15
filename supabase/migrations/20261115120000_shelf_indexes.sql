-- A board reads its shelves a page at a time in board order: the tasks of one status, not archived and not deleted,
-- by position and then number, or the archive the same way. The only index on tasks by board was its key, so each
-- page read every task on the board and sorted the shelf's to find its first hundred. These hold each shelf in that
-- order, so a page reads only its own rows, and the first page of a five-column board reads about 500 rather than
-- every task five times over
create index if not exists tasks_shelf on public.tasks (board_id, status, position, number)
  where deleted_at is null and archived_at is null;

create index if not exists tasks_archive_shelf on public.tasks (board_id, position, number)
  where deleted_at is null and archived_at is not null;
