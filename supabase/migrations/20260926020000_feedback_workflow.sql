alter table public.feedback_messages
add column if not exists work_status text not null default 'new';

alter table public.feedback_messages
add column if not exists owner_note text not null default '';
