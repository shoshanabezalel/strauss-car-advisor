-- M5: Realtime moves to broadcast pings (server → `conversation:<id>` / `rep-queue`, no payload); screens refetch
-- through the API routes with the service role. postgres_changes is no longer used, so the tables leave the
-- publication: row changes are no longer streamed to anyone holding the publishable key (TECH-DESIGN §7b, §8).
alter publication supabase_realtime drop table public.messages, public.rep_questions;
