-- A board no longer reads every task when it opens. Its tasks sit on shelves, one for each status and one for the
-- archive, and it reads the first page of each shelf its view shows. Shelves it leaves on the server still need
-- their counts, for the column headers, the sidebar and the progress bar, and the last position on each, so a card
-- moved to the end of a column nobody has read goes after everything already there. This answers both for every
-- shelf in one pass over the board's tasks.
--
-- It runs as the caller, so row security decides what it counts, the same as a read of the tasks themselves
create or replace function public.board_shelves(p_board uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(shelf, jsonb_build_object('count', n, 'tail', tail)), '{}'::jsonb)
  from (
    select
      case when t.archived_at is not null then 'archived' else t.status end as shelf,
      count(*) as n,
      max(t.position) as tail
    from public.tasks t
    where t.board_id = p_board and t.deleted_at is null
    group by 1
  ) shelves;
$$;

revoke execute on function public.board_shelves(uuid) from public, anon;
grant execute on function public.board_shelves(uuid) to authenticated;
