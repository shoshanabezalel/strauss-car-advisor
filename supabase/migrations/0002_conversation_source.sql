-- M4: tag conversations by origin so e2e runs can be cleaned up (npm run db:clean-e2e).
-- Child rows (messages, profiles, rep_questions, comparisons) go with them via on delete cascade.

alter table public.conversations
  add column source text not null default 'app' check (source in ('app', 'e2e'));

create index conversations_source_idx on public.conversations (source);
