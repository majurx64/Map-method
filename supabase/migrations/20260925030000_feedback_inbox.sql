create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_email text,
  reply_email text,
  kind text not null,
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.feedback_messages enable row level security;

grant insert, select, update on table public.feedback_messages to authenticated;

drop policy if exists "Users can send feedback" on public.feedback_messages;
create policy "Users can send feedback"
on public.feedback_messages
for insert
to authenticated
with check (sender_id = auth.uid());

drop policy if exists "Owner can read feedback" on public.feedback_messages;
create policy "Owner can read feedback"
on public.feedback_messages
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru');

drop policy if exists "Owner can update feedback" on public.feedback_messages;
create policy "Owner can update feedback"
on public.feedback_messages
for update
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru');

create index if not exists feedback_messages_created_at_idx
on public.feedback_messages (created_at desc);

drop policy if exists "Users can upload feedback attachments" on storage.objects;
create policy "Users can upload feedback attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'feedback-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owner can read feedback attachments" on storage.objects;
create policy "Owner can read feedback attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'feedback-attachments'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru'
);
