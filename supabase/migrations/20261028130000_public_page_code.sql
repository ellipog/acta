-- Public pages can carry their owner's own CSS and HTML now, which needs more room than the settings alone
alter table public.boards drop constraint boards_page_check;
alter table public.boards add constraint boards_page_check
  check (jsonb_typeof(page) = 'object' and octet_length(page::text) <= 64000);
