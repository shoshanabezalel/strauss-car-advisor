-- M7: public deploy hardening (TECH-DESIGN §8, §10).

-- 1. No screen reads tables with the publishable key any more (pages and Realtime refetches go through the API
--    routes with the service role), so the demo read-all policies go. RLS stays on with no policy = no access.
--    value_of_use keeps its read policy: it is the tax authority's public table, and check:db reads it that way.
drop policy demo_read on public.conversations;
drop policy demo_read on public.messages;
drop policy demo_read on public.profiles;
drop policy demo_read on public.rep_questions;
drop policy demo_read on public.comparisons;

-- 2. Conversation owner: SHA-256 of the creator's httpOnly cookie. Null for conversations created before M7
--    (nobody can open those through the API).
alter table public.conversations add column owner_hash text check (owner_hash ~ '^[0-9a-f]{64}$');

-- 3. Rate limits: fixed-window counters, written only through hit_rate_limit by the service role.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

create function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns table (allowed boolean, retry_after integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_start timestamptz := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Keep the table small: this key's finished windows are no longer needed.
  delete from public.rate_limits where key = p_key and window_start < v_start;

  allowed := v_count <= p_max;
  retry_after := case when allowed then 0
                      else greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer) end;
  return next;
end;
$$;

-- Only the server (service role) may count. Supabase grants execute on new public functions to anon and
-- authenticated by default, so revoke it explicitly.
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
