grant delete on table public.feedback_messages to authenticated;

drop policy if exists "Owner can delete feedback" on public.feedback_messages;
create policy "Owner can delete feedback"
on public.feedback_messages
for delete
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru');

drop policy if exists "Owner can delete feedback attachments" on storage.objects;
create policy "Owner can delete feedback attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'feedback-attachments'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru'
);
