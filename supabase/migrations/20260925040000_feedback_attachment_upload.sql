drop policy if exists "Users can upload feedback attachments" on storage.objects;

create policy "Users can upload feedback attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'feedback-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
