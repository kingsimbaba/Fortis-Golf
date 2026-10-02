-- Course photos only: no changes to courses, rounds, scores or auth tables.
-- Run once using the project's Supabase SQL editor before deploying the UI.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-photos', 'course-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Course photos signed in read"
on storage.objects for select to authenticated
using (bucket_id = 'course-photos');

create policy "Course photos signed in upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'course-photos' and name ~ '^courses/[0-9a-f]{64}\.jpg$');

create policy "Course photos signed in replace"
on storage.objects for update to authenticated
using (bucket_id = 'course-photos' and name ~ '^courses/[0-9a-f]{64}\.jpg$')
with check (bucket_id = 'course-photos' and name ~ '^courses/[0-9a-f]{64}\.jpg$');
commit;
