-- People can fix and take back their own comments in a task's dialog, as an agent could already fix its own with
-- edit_comment, and owners and admins can take back anyone's. A comment that was changed says when.
--
-- On a task that syncs with a GitHub issue, the edit or the deletion goes to the issue's comment too. The trigger
-- from 20261029120000_github_issue_comments already queues both, so nothing changes for that here

alter table public.comments add column edited_at timestamptz;

-- Only a change to what it says counts, and only the database sets it, so it can't be written as a comment goes in
-- or written over. GitHub's own edits, coming in through the webhook, are edits too
create function public.stamp_comment_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

create trigger comments_stamp_edit before update on public.comments
  for each row execute function public.stamp_comment_edit();

-- Catching up after a dropped connection reads the comments edited since then as well as the ones written. Few are
-- ever edited, so only those are in it
create index if not exists comments_board_edited on public.comments (board_id, edited_at) where edited_at is not null;

-- Whether you're an owner or admin of the board's workspace
create function public.board_admin(b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.boards bo
    join public.members m on m.workspace_id = bo.workspace_id
    where bo.id = b and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')
  );
$$;

revoke execute on function public.board_admin(uuid) from public, anon;
grant execute on function public.board_admin(uuid) to authenticated;

-- Editing a comment needs the right to comment, as writing one does, so someone who can't comment any more can't
-- change what they said either. They can still take it back
alter policy "People edit their comments" on public.comments
  using (author = (select auth.uid()) and public.board_can(board_id, 'comment'))
  with check (author = (select auth.uid()) and public.board_can(board_id, 'comment'));

alter policy "People delete their comments" on public.comments
  using (author = (select auth.uid()) or public.board_admin(board_id));
