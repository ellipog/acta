-- Comments made in Acta on a task that syncs with a GitHub issue go to the issue too. Edits follow, and a comment
-- deleted in Acta comes off the issue. GitHub's own comments, which come in through the webhook, never go back

alter table public.github_outbox
  add column comment_id uuid,
  -- The issue comment a deleted comment had, since its row here is gone by the time it's sent
  add column github_comment bigint;

-- Which issue comment each Acta comment became, so edits and deletes reach the same one. Not tied to the comment
-- row, which may be gone before the delete is sent
create table public.github_issue_comments (
  comment_id uuid primary key,
  repo_id bigint not null references public.github_repos (id) on delete cascade,
  github_id bigint not null
);

alter table public.github_issue_comments enable row level security;
revoke all on public.github_issue_comments from anon, authenticated;

create function public.queue_github_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments;
begin
  if coalesce(current_setting('acta.via', true), '') = 'GitHub' then
    return null;
  end if;
  if tg_op = 'DELETE' then c := old; else c := new; end if;
  if c.via is not distinct from 'GitHub' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    -- Only comments that went to GitHub, and not when the whole task is going
    if not exists (select 1 from public.github_issue_comments where comment_id = c.id)
      or not exists (select 1 from public.tasks where board_id = c.board_id and number = c.number) then
      return null;
    end if;
  elsif not exists (
    select 1 from public.task_links where board_id = c.board_id and number = c.number and kind = 'issue'
  ) then
    return null;
  end if;
  insert into public.github_outbox (board_id, number, fields, comment_id, github_comment)
  values (
    c.board_id,
    c.number,
    array[case when tg_op = 'DELETE' then 'uncomment' else 'comment' end],
    c.id,
    (select github_id from public.github_issue_comments where comment_id = c.id)
  );
  return null;
end;
$$;

create trigger queue_github_comment after insert or delete or update of body on public.comments
  for each row execute function public.queue_github_comment();
