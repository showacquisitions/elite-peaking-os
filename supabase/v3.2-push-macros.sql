-- Elite OS v3.1: coach nutrition targets + push notifications. Run after v3.sql and v3.1-health-cardio.sql. Safe to re-run. (Applied 2026-11-06.)
-- After running: store the VAPID private JWK once with vault.create_secret(<jwk json>, 'push_vapid_private').
-- The matching public key is VAPID_PUB in index.html.
-- Secrets live in Supabase Vault, never in this file:
--   push_vapid_private  : VAPID private key as JWK JSON (set once, see docs/Memory.md)
--   push_cron_secret    : random string generated below if missing
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- coach nutrition targets ----------
alter table public.coach_links add column if not exists targets jsonb;

-- ---------- push subscriptions and queue ----------
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  prefs      jsonb not null default '{"rest":true,"rem":true,"coach":true}'::jsonb,
  created_at timestamptz not null default now(),
  last_ok    timestamptz
);
alter table public.push_subs enable row level security;
create index if not exists push_subs_user on public.push_subs(user_id);
drop policy if exists "own subs read" on public.push_subs;
drop policy if exists "own subs delete" on public.push_subs;
create policy "own subs read" on public.push_subs for select using (auth.uid() = user_id);
create policy "own subs delete" on public.push_subs for delete using (auth.uid() = user_id);

create table if not exists public.push_queue (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  endpoint  text,
  cat       text not null check (cat in ('rest','rem','coach')),
  tag       text not null,
  title     text not null,
  body      text not null default '',
  url       text,
  due_at    timestamptz not null default now(),
  sent_at   timestamptz
);
alter table public.push_queue enable row level security; -- no policies: definer functions only
create unique index if not exists push_queue_pending on public.push_queue(user_id, tag) where sent_at is null;
create index if not exists push_queue_due on public.push_queue(due_at) where sent_at is null;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'push_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_cron_secret', 'Auth between pg_net and the push edge function');
  end if;
end $$;

-- Wakes the push function when something is due. Called by the cron job and right after instant events.
create or replace function public.push_kick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.push_queue where sent_at is null and due_at <= now()) then
    perform net.http_post(
      url := 'https://yimjcsyhvoviliupwayl.supabase.co/functions/v1/push',
      body := '{"action":"flush"}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')));
  end if;
end $$;

create or replace function public.push_enqueue(uid uuid, c text, t text, ti text, bo text, u text, due timestamptz, ep text, kick boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if uid is null then return; end if;
  insert into public.push_queue(user_id, endpoint, cat, tag, title, body, url, due_at)
  values (uid, ep, c, left(t, 120), left(ti, 120), left(coalesce(bo, ''), 300), u, coalesce(due, now()))
  on conflict (user_id, tag) where sent_at is null
  do update set endpoint = excluded.endpoint, title = excluded.title, body = excluded.body, url = excluded.url, due_at = excluded.due_at;
  if kick then perform public.push_kick(); end if;
end $$;

-- ---------- client RPCs ----------
create or replace function public.push_subscribe(ep text, k text, a text, pr jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if ep !~ '^https://' or length(ep) > 1000 then raise exception 'bad endpoint'; end if;
  insert into public.push_subs(endpoint, user_id, p256dh, auth, prefs) values (ep, auth.uid(), left(k, 200), left(a, 100), coalesce(pr, '{"rest":true,"rem":true,"coach":true}'::jsonb))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs;
end $$;

create or replace function public.push_set_prefs(ep text, pr jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.push_subs set prefs = pr where endpoint = ep and user_id = auth.uid();
$$;

create or replace function public.push_unsubscribe(ep text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subs where endpoint = ep and user_id = auth.uid();
$$;

create or replace function public.push_timer(ep text, secs int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if secs < 3 or secs > 900 then raise exception 'seconds out of range'; end if;
  perform public.push_enqueue(auth.uid(), 'rest', 'rest', '⏱ Rest is over', 'Time for your next set.', '#wm', now() + make_interval(secs => secs), ep, false);
end $$;

create or replace function public.push_timer_cancel() returns void
language sql security definer set search_path = '' as $$
  delete from public.push_queue where user_id = auth.uid() and tag = 'rest' and sent_at is null;
$$;

-- rows: [{key, at (timestamptz with offset), title, body}] — replaces all pending reminders
create or replace function public.push_schedule(rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int := 0; due timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.push_queue where user_id = auth.uid() and cat = 'rem' and sent_at is null;
  if jsonb_typeof(rows) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(rows) limit 40 loop
    begin due := (r->>'at')::timestamptz; exception when others then continue; end;
    if due <= now() or due > now() + interval '21 days' then continue; end if;
    perform public.push_enqueue(auth.uid(), 'rem', 'rem:' || left(coalesce(r->>'key', due::text), 60), coalesce(r->>'title', 'Workout'), r->>'body', '#today', due, null, false);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- coach nutrition targets ----------
create or replace function public.coach_set_targets(client uuid, t jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare p numeric; c numeric; f numeric; l public.coach_links;
begin
  select * into l from public.coach_links where coach_id = auth.uid() and client_id = client;
  if l.coach_id is null then raise exception 'not your client'; end if;
  if t is null or jsonb_typeof(t) = 'null' then
    update public.coach_links set targets = null where coach_id = auth.uid() and client_id = client;
    return;
  end if;
  p := (t->>'P')::numeric; c := (t->>'C')::numeric; f := (t->>'F')::numeric;
  if p is null or p < 30 or p > 450 then raise exception 'protein must be 30–450 g'; end if;
  if c is null or c < 0 or c > 1000 then raise exception 'carbs must be 0–1000 g'; end if;
  if f is null or f < 15 or f > 300 then raise exception 'fat must be 15–300 g'; end if;
  if 4*p + 4*c + 9*f < 1000 then raise exception 'that is under 1000 kcal, too low to prescribe here'; end if;
  update public.coach_links set targets = jsonb_build_object('P', round(p), 'C', round(c), 'F', round(f), 'note', left(coalesce(t->>'note', ''), 300), 'at', now())
  where coach_id = auth.uid() and client_id = client;
  perform public.push_enqueue(client, 'coach', 'targets', '🍽️ New nutrition targets', coalesce(nullif(l.coach_name, ''), 'Your coach') || ' set ' || round(4*p + 4*c + 9*f) || ' kcal · P ' || round(p) || ' C ' || round(c) || ' F ' || round(f), '#today', now(), null, true);
end $$;

-- ---------- event triggers ----------
create or replace function public.tg_push_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l public.coach_links; to_id uuid; who text;
begin
  select * into l from public.coach_links where coach_id = new.coach_id and client_id = new.client_id;
  if new.author = new.coach_id then to_id := new.client_id; who := coalesce(nullif(l.coach_name, ''), 'Coach');
  else to_id := new.coach_id; who := coalesce(nullif(l.client_name, ''), 'Client'); end if;
  perform public.push_enqueue(to_id, 'coach', 'msg:' || new.coach_id || new.client_id, '💬 ' || who, new.body, case when to_id = new.coach_id then '#coach' else '#today' end, now(), null, true);
  return null;
end $$;
drop trigger if exists push_message on public.messages;
create trigger push_message after insert on public.messages for each row execute function public.tg_push_message();

create or replace function public.tg_push_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l public.coach_links;
begin
  if new.date < current_date then return null; end if;
  select * into l from public.coach_links where coach_id = new.coach_id and client_id = new.client_id;
  -- due in 4 s so a bulk program upsert collapses into one notification (same tag)
  perform public.push_enqueue(new.client_id, 'coach', 'asg:' || new.coach_id, '📋 Plan updated by ' || coalesce(nullif(l.coach_name, ''), 'your coach'),
    case when coalesce(new.session->'ex', '[]'::jsonb) = '[]'::jsonb then 'Rest day on ' else coalesce(new.session->>'name', 'Workout') || ' on ' end || to_char(new.date, 'Dy Mon DD'), '#today', now() + interval '4 seconds', null, false);
  return null;
end $$;
drop trigger if exists push_assignment on public.assignments;
create trigger push_assignment after insert or update on public.assignments for each row execute function public.tg_push_assignment();

create or replace function public.tg_push_checkin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l record;
begin
  if tg_op = 'INSERT' or new.data is distinct from old.data then
    for l in select * from public.coach_links where client_id = new.client_id loop
      perform public.push_enqueue(l.coach_id, 'coach', 'ci:' || new.client_id, '📝 ' || coalesce(nullif(l.client_name, ''), 'A client') || ' sent a check-in', 'Week of ' || to_char(new.week, 'Mon DD'), '#coach', now(), null, true);
    end loop;
  end if;
  if tg_op = 'UPDATE' and new.reply is distinct from old.reply and new.reply <> '' then
    perform public.push_enqueue(new.client_id, 'coach', 'cireply', '💬 Your coach replied to your check-in', new.reply, '#progress', now(), null, true);
  end if;
  return null;
end $$;
drop trigger if exists push_checkin on public.checkins;
create trigger push_checkin after insert or update on public.checkins for each row execute function public.tg_push_checkin();

-- ---------- service-role functions used by the push edge function ----------
create or replace function public.push_check(s text) returns jsonb
language sql security definer set search_path = '' as $$
  select case when s is not null and s = (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    then jsonb_build_object('ok', true, 'vapid', (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private'))
    else jsonb_build_object('ok', false) end;
$$;

create or replace function public.push_claim(lim int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  with c as (
    update public.push_queue q set sent_at = now()
    where q.id in (select id from public.push_queue where sent_at is null and due_at <= now() order by due_at limit lim for update skip locked)
    returning q.*)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'body', c.body, 'url', c.url, 'tag', c.tag, 'cat', c.cat,
    'subs', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth))), '[]'::jsonb)
             from public.push_subs s where s.user_id = c.user_id and (c.endpoint is null or s.endpoint = c.endpoint) and coalesce(s.prefs->>c.cat, 'true') <> 'false'))), '[]'::jsonb)
  into out from c;
  delete from public.push_queue where sent_at < now() - interval '3 days';
  return out;
end $$;

create or replace function public.push_result(ok_eps text[], dead_eps text[]) returns void
language sql security definer set search_path = '' as $$
  update public.push_subs set last_ok = now() where endpoint = any(ok_eps);
  delete from public.push_subs where endpoint = any(dead_eps);
$$;

-- ---------- grants ----------
revoke all on function public.push_kick() from public, anon, authenticated;
revoke all on function public.push_enqueue(uuid, text, text, text, text, text, timestamptz, text, boolean) from public, anon, authenticated;
revoke all on function public.push_check(text) from public, anon, authenticated;
revoke all on function public.push_claim(int) from public, anon, authenticated;
revoke all on function public.push_result(text[], text[]) from public, anon, authenticated;
grant execute on function public.push_check(text) to service_role;
grant execute on function public.push_claim(int) to service_role;
grant execute on function public.push_result(text[], text[]) to service_role;
revoke all on function public.push_subscribe(text, text, text, jsonb) from public, anon;
revoke all on function public.push_set_prefs(text, jsonb) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
revoke all on function public.push_timer(text, int) from public, anon;
revoke all on function public.push_timer_cancel() from public, anon;
revoke all on function public.push_schedule(jsonb) from public, anon;
revoke all on function public.coach_set_targets(uuid, jsonb) from public, anon;
grant execute on function public.push_subscribe(text, text, text, jsonb) to authenticated;
grant execute on function public.push_set_prefs(text, jsonb) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
grant execute on function public.push_timer(text, int) to authenticated;
grant execute on function public.push_timer_cancel() to authenticated;
grant execute on function public.push_schedule(jsonb) to authenticated;
grant execute on function public.coach_set_targets(uuid, jsonb) to authenticated;

-- ---------- scheduler: every 5 seconds, only calls out when something is due ----------
select cron.unschedule(jobid) from cron.job where jobname = 'elite-push';
select cron.schedule('elite-push', '5 seconds', 'select public.push_kick()');

-- ---------- test notification (added after first apply) ----------
alter table public.push_queue drop constraint if exists push_queue_cat_check;
alter table public.push_queue add constraint push_queue_cat_check check (cat in ('rest','rem','coach','test'));
create or replace function public.push_test(ep text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.push_enqueue(auth.uid(), 'test', 'test', '🔔 Notifications are on', 'This is a test from Elite OS. You''re all set.', '#today', now(), ep, true);
end $$;
revoke all on function public.push_test(text) from public, anon;
grant execute on function public.push_test(text) to authenticated;
