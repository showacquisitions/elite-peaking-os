-- Elite OS v3: coach mode, check-ins, messages, health auto-sync.
-- Safe to run any number of times. Run after the original setup SQL (progress table + delete_me).
create extension if not exists pgcrypto with schema extensions;

-- ---------- coach <-> client links ----------
create table if not exists public.coach_links (
  coach_id    uuid not null references auth.users(id) on delete cascade,
  client_id   uuid not null references auth.users(id) on delete cascade,
  coach_name  text not null default '',
  client_name text not null default '',
  habits      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  primary key (coach_id, client_id),
  check (coach_id <> client_id)
);
alter table public.coach_links enable row level security;
create index if not exists coach_links_client on public.coach_links(client_id);

-- true when the caller coaches this client (security definer avoids RLS recursion)
create or replace function public.is_coach_of(client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.coach_links l where l.coach_id = auth.uid() and l.client_id = client);
$$;

drop policy if exists "link parties read" on public.coach_links;
drop policy if exists "link parties delete" on public.coach_links;
create policy "link parties read" on public.coach_links for select using (auth.uid() in (coach_id, client_id));
create policy "link parties delete" on public.coach_links for delete using (auth.uid() in (coach_id, client_id));
-- no insert/update policies: links are created by coach_invite_accept, habits set by coach_set_habits

-- ---------- invite codes ----------
create table if not exists public.coach_invites (
  code       text primary key,
  coach_id   uuid not null references auth.users(id) on delete cascade,
  coach_name text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table public.coach_invites enable row level security;
drop policy if exists "coach reads own invites" on public.coach_invites;
drop policy if exists "coach deletes own invites" on public.coach_invites;
create policy "coach reads own invites" on public.coach_invites for select using (auth.uid() = coach_id);
create policy "coach deletes own invites" on public.coach_invites for delete using (auth.uid() = coach_id);

create or replace function public.coach_invite_new(my_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.coach_invites where coach_id = auth.uid() or expires_at < now();
  c := substr(translate(upper(encode(extensions.gen_random_bytes(12), 'base64')), '+/=0O1I', ''), 1, 8);
  insert into public.coach_invites(code, coach_id, coach_name) values (c, auth.uid(), left(coalesce(my_name, ''), 60));
  return c;
end $$;

create or replace function public.coach_invite_accept(invite text, my_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.coach_invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into i from public.coach_invites where code = upper(trim(invite)) and expires_at > now();
  if i.code is null then raise exception 'invite code not found or expired'; end if;
  if i.coach_id = auth.uid() then raise exception 'that is your own invite code'; end if;
  insert into public.coach_links(coach_id, client_id, coach_name, client_name)
  values (i.coach_id, auth.uid(), i.coach_name, left(coalesce(my_name, ''), 60))
  on conflict (coach_id, client_id) do update set coach_name = excluded.coach_name, client_name = excluded.client_name;
  return jsonb_build_object('coach_id', i.coach_id, 'coach_name', i.coach_name);
end $$;

create or replace function public.coach_set_habits(client uuid, h jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(h) <> 'array' or jsonb_array_length(h) > 10 then raise exception 'habits must be a list of up to 10'; end if;
  update public.coach_links set habits = h where coach_id = auth.uid() and client_id = client;
  if not found then raise exception 'not your client'; end if;
end $$;

-- ---------- coach reads client progress (read only) ----------
drop policy if exists "coach reads client" on public.progress;
create policy "coach reads client" on public.progress for select using (public.is_coach_of(user_id));

-- ---------- coach-assigned sessions, one per client per date ----------
create table if not exists public.assignments (
  coach_id   uuid not null,
  client_id  uuid not null,
  date       date not null,
  session    jsonb not null,
  note       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (coach_id, client_id, date),
  foreign key (coach_id, client_id) references public.coach_links(coach_id, client_id) on delete cascade
);
alter table public.assignments enable row level security;
create index if not exists assignments_client on public.assignments(client_id, date);
drop policy if exists "asg read" on public.assignments;
drop policy if exists "asg coach insert" on public.assignments;
drop policy if exists "asg coach update" on public.assignments;
drop policy if exists "asg coach delete" on public.assignments;
create policy "asg read" on public.assignments for select using (auth.uid() = client_id or auth.uid() = coach_id);
create policy "asg coach insert" on public.assignments for insert with check (auth.uid() = coach_id);
create policy "asg coach update" on public.assignments for update using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create policy "asg coach delete" on public.assignments for delete using (auth.uid() = coach_id);

-- ---------- messages and workout comments ----------
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  coach_id   uuid not null,
  client_id  uuid not null,
  author     uuid not null default auth.uid(),
  date       date,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (coach_id, client_id) references public.coach_links(coach_id, client_id) on delete cascade
);
alter table public.messages enable row level security;
create index if not exists messages_pair on public.messages(coach_id, client_id, created_at);
drop policy if exists "msg read" on public.messages;
drop policy if exists "msg write" on public.messages;
drop policy if exists "msg delete own" on public.messages;
create policy "msg read" on public.messages for select using (auth.uid() in (coach_id, client_id));
create policy "msg write" on public.messages for insert with check (author = auth.uid() and auth.uid() in (coach_id, client_id));
create policy "msg delete own" on public.messages for delete using (author = auth.uid());

-- ---------- weekly check-ins ----------
create table if not exists public.checkins (
  client_id  uuid not null references auth.users(id) on delete cascade,
  week       date not null,
  data       jsonb not null default '{}'::jsonb,
  reply      text not null default '',
  replied_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (client_id, week)
);
alter table public.checkins enable row level security;
drop policy if exists "ci own select" on public.checkins;
drop policy if exists "ci own insert" on public.checkins;
drop policy if exists "ci own update" on public.checkins;
drop policy if exists "ci coach read" on public.checkins;
create policy "ci own select" on public.checkins for select using (auth.uid() = client_id);
create policy "ci own insert" on public.checkins for insert with check (auth.uid() = client_id);
create policy "ci own update" on public.checkins for update using (auth.uid() = client_id) with check (auth.uid() = client_id);
create policy "ci coach read" on public.checkins for select using (public.is_coach_of(client_id));

create or replace function public.coach_checkin_reply(client uuid, wk date, txt text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_coach_of(client) then raise exception 'not your client'; end if;
  update public.checkins set reply = left(coalesce(txt, ''), 2000), replied_at = now() where client_id = client and week = wk;
  if not found then raise exception 'check-in not found'; end if;
end $$;

-- ---------- health auto-sync ----------
create table if not exists public.health_tokens (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.health_tokens enable row level security; -- no policies: only the functions below touch it

create table if not exists public.health_daily (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  steps      integer,
  weight_kg  numeric(5,2),
  sleep_h    numeric(4,2),
  rhr        numeric(5,1),
  hrv        numeric(6,1),
  kcal       integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.health_daily enable row level security;
drop policy if exists "hd own read" on public.health_daily;
drop policy if exists "hd own delete" on public.health_daily;
drop policy if exists "hd coach read" on public.health_daily;
create policy "hd own read" on public.health_daily for select using (auth.uid() = user_id);
create policy "hd own delete" on public.health_daily for delete using (auth.uid() = user_id);
create policy "hd coach read" on public.health_daily for select using (public.is_coach_of(user_id));

-- New token replaces the old one. Returned once; only its hash is stored.
create or replace function public.health_token_new() returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.health_tokens(user_id, token_hash) values (auth.uid(), encode(extensions.digest(t, 'sha256'), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now();
  return t;
end $$;

create or replace function public.health_token_revoke() returns void
language sql security definer set search_path = '' as $$
  delete from public.health_tokens where user_id = auth.uid();
$$;

create or replace function public._hnum(v text, lo numeric, hi numeric) returns numeric
language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  v := regexp_replace(coalesce(v, ''), '[^0-9.\-]', '', 'g');
  if v = '' or v = '-' or v = '.' then return null; end if;
  n := v::numeric;
  if n < lo or n > hi then return null; end if;
  return n;
exception when others then return null;
end $$;

-- Called by the iPhone Shortcut (or any automation) with the anon key. Auth is the token.
-- payload: one day {date, steps, weight, unit, sleep, rhr, hrv, kcal}, a list of those, or {rows:[...]}.
create or replace function public.health_ingest(token text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; rows jsonb; r jsonb; d date; n int := 0; w numeric; s numeric; u text;
begin
  select user_id into uid from public.health_tokens where token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex');
  if uid is null then raise exception 'invalid health token'; end if;
  rows := case when jsonb_typeof(payload) = 'array' then payload
               when payload ? 'rows' then payload->'rows'
               else jsonb_build_array(payload) end;
  if jsonb_array_length(rows) > 400 then raise exception 'too many rows (max 400)'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    begin d := left(coalesce(r->>'date', current_date::text), 10)::date;
    exception when others then continue; end;
    u := lower(coalesce(r->>'unit', payload->>'unit', 'kg'));
    w := public._hnum(r->>'weight', 20, 700);
    if w is not null and u like 'lb%' then w := w / 2.20462; end if;
    if w is not null and (w < 20 or w > 320) then w := null; end if;
    s := public._hnum(r->>'sleep', 0, 100000);
    if s is not null and s > 1440 then s := s / 3600; elsif s is not null and s > 24 then s := s / 60; end if;
    insert into public.health_daily as h (user_id, date, steps, weight_kg, sleep_h, rhr, hrv, kcal)
    values (uid, d,
      public._hnum(r->>'steps', 0, 150000)::int, round(w, 2), round(s, 2),
      public._hnum(r->>'rhr', 20, 220), public._hnum(r->>'hrv', 1, 400), public._hnum(r->>'kcal', 0, 15000)::int)
    on conflict (user_id, date) do update set
      steps = coalesce(excluded.steps, h.steps),
      weight_kg = coalesce(excluded.weight_kg, h.weight_kg),
      sleep_h = coalesce(excluded.sleep_h, h.sleep_h),
      rhr = coalesce(excluded.rhr, h.rhr),
      hrv = coalesce(excluded.hrv, h.hrv),
      kcal = coalesce(excluded.kcal, h.kcal),
      updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'days', n);
end $$;

-- ---------- grants ----------
revoke all on function public.is_coach_of(uuid) from public;
revoke all on function public.coach_invite_new(text) from public, anon;
revoke all on function public.coach_invite_accept(text, text) from public, anon;
revoke all on function public.coach_set_habits(uuid, jsonb) from public, anon;
revoke all on function public.coach_checkin_reply(uuid, date, text) from public, anon;
revoke all on function public.health_token_new() from public, anon;
revoke all on function public.health_token_revoke() from public, anon;
revoke all on function public._hnum(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.health_ingest(text, jsonb) from public;
grant execute on function public.is_coach_of(uuid) to anon, authenticated; -- returns false for anon; RLS policies call it
grant execute on function public.coach_invite_new(text) to authenticated;
grant execute on function public.coach_invite_accept(text, text) to authenticated;
grant execute on function public.coach_set_habits(uuid, jsonb) to authenticated;
grant execute on function public.coach_checkin_reply(uuid, date, text) to authenticated;
grant execute on function public.health_token_new() to authenticated;
grant execute on function public.health_token_revoke() to authenticated;
grant execute on function public.health_ingest(text, jsonb) to anon, authenticated;
