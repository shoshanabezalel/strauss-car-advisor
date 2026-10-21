-- G: information gaps log (מאגר פערי מידע, TECH-DESIGN §7f). What the system could not answer from real data, so
-- Strauss can see what is missing from the catalog and the rules. Company data only; no personal data: type, topic,
-- a fixed or checked short description, the car if any, the conversation id, timestamps.

-- One row per (conversation, type, topic); a repeat updates last_seen_at. Rows go with their conversation.
create table public.information_gaps (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  type text not null check (type in ('no_data', 'referred_to_rep', 'unknown_vehicle')),
  topic text not null check (length(topic) between 1 and 120),
  description text not null check (length(description) between 1 and 200),
  vehicle text check (vehicle is null or length(vehicle) <= 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (conversation_id, type, topic)
);
create index information_gaps_group_idx on public.information_gaps (type, topic, last_seen_at desc);

-- טופל per (type, topic). A gap seen after resolved_at reopens the group (computed in the app).
create table public.information_gap_status (
  type text not null check (type in ('no_data', 'referred_to_rep', 'unknown_vehicle')),
  topic text not null,
  resolved_at timestamptz not null default now(),
  primary key (type, topic)
);

-- RLS on, no policies: the browser key reads and writes nothing (as for the conversation tables since 0004).
-- The API routes use the service role behind the rep session.
alter table public.information_gaps enable row level security;
alter table public.information_gap_status enable row level security;
