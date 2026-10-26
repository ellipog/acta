create function public.board_slug_ok(s text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select s ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' and s <> 'settings';
$$;

alter table public.boards drop constraint boards_slug_check;
alter table public.boards add constraint boards_slug_check check (public.board_slug_ok(slug));
