-- Images and files on tasks. They live in a private bucket that only the server reads and writes, through
-- /api/files, which checks who's asking: members of the board's workspace, or anyone for a public task on a
-- published roadmap. The server makes the bucket itself on the first upload, so this is only here for a database
-- set up by hand. No policies on storage.objects, so signed-in people and visitors can't reach it directly
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;
