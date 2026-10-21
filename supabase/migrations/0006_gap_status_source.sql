-- G: test data stays out of the production gaps view (TECH-DESIGN §7f). Gap rows are read per conversation source
-- (join on conversations.source, no column needed); טופל is set per source, so the e2e server can never mark a
-- production group as handled. db:clean-e2e deletes the e2e status rows.
alter table public.information_gap_status
  add column source text not null default 'app' check (source in ('app', 'e2e'));
alter table public.information_gap_status drop constraint information_gap_status_pkey;
alter table public.information_gap_status add primary key (source, type, topic);
