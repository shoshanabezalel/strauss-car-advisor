-- M0: initial schema (TECH-DESIGN §8).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'waiting_rep', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.profiles (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.rep_questions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  field text not null,
  question text not null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'answered')),
  answer jsonb,
  answered_by text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check ((status = 'answered') = (answer is not null))
);
create index rep_questions_open_idx on public.rep_questions (status, created_at);
create index rep_questions_conversation_idx on public.rep_questions (conversation_id);

create table public.comparisons (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index comparisons_conversation_idx on public.comparisons (conversation_id, created_at);

-- Tax-authority value-of-use (data/raw/vou-2026.csv, imported in M2).
-- Codes are text: they carry leading zeros. Key includes vehicle_type_code (ATTO 3 / TANG collision).
create table public.value_of_use (
  tax_year smallint not null,
  reg_year smallint not null,
  vehicle_type_code text not null,
  make_code text not null,
  model_code text not null,
  make_name text,
  model_name text,
  trade_name text,
  drive_code text,
  list_price numeric,
  value_of_use numeric not null,
  raw jsonb,
  primary key (tax_year, reg_year, vehicle_type_code, make_code, model_code)
);
create index value_of_use_trade_name_idx on public.value_of_use (tax_year, trade_name);

-- Realtime: employee screen listens to its messages + rep_questions; rep screen to open rep_questions.
alter publication supabase_realtime add table public.messages, public.rep_questions;

-- RLS on every table.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.profiles enable row level security;
alter table public.rep_questions enable row level security;
alter table public.comparisons enable row level security;
alter table public.value_of_use enable row level security;

-- DEMO ONLY: tighten later (M7, before the public deploy).
-- No auth in the demo (conversation id in the URL). The publishable key may READ so that
-- Realtime and page loads work; all writes go through API routes with the service role.
create policy demo_read on public.conversations for select to anon, authenticated using (true);
create policy demo_read on public.messages for select to anon, authenticated using (true);
create policy demo_read on public.profiles for select to anon, authenticated using (true);
create policy demo_read on public.rep_questions for select to anon, authenticated using (true);
create policy demo_read on public.comparisons for select to anon, authenticated using (true);
create policy demo_read on public.value_of_use for select to anon, authenticated using (true);
