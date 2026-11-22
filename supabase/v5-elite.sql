-- Elite OS v5.0: Check-in RLS column guard, Health cardio merge, Push failure tracking & smarter cron.
-- Additive and idempotent. Run after v4-health.sql and v3.3-unread-photos.sql.

-- 1. Security fix: only coach_checkin_reply may write `reply` / `replied_at` on public.checkins.
-- Keyed on current_user, not auth.uid(): a direct PostgREST write runs as anon/authenticated, while
-- coach_checkin_reply is SECURITY DEFINER and runs as its owner. Covers INSERT too — "ci own insert"
-- would otherwise let a client create a row with a forged reply already set.
-- (Self-coaching cannot reach this: coach_links has check (coach_id <> client_id).)
create or replace function public.tg_checkins_protect_reply() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.reply <> '' or new.replied_at is not null then
        raise exception 'clients cannot write coach replies';
      end if;
    elsif new.reply is distinct from old.reply or new.replied_at is distinct from old.replied_at then
      raise exception 'clients cannot edit coach replies';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists checkins_protect_reply on public.checkins;
create trigger checkins_protect_reply before insert or update on public.checkins
  for each row execute function public.tg_checkins_protect_reply();

-- 2. Health ingest: merge same-day cardio workouts by (type, min) instead of wiping earlier workouts
create or replace function public._merge_cardio(old_c jsonb, new_c jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when new_c is null or jsonb_typeof(new_c) <> 'array' or jsonb_array_length(new_c) = 0 then old_c
    when old_c is null or jsonb_typeof(old_c) <> 'array' or jsonb_array_length(old_c) = 0 then new_c
    else (
      select jsonb_agg(item) from (
        select distinct on (coalesce(item->>'type', ''), coalesce(item->>'min', '')) item
        from (
          select item, 1 as ord from jsonb_array_elements(new_c) item
          union all
          select item, 2 as ord from jsonb_array_elements(old_c) item
        ) u
        order by coalesce(item->>'type', ''), coalesce(item->>'min', ''), ord
        limit 20
      ) dedup
    )
  end;
$$;

create or replace function public.health_ingest(token text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; rows jsonb; r jsonb; d date; n int := 0; w numeric; s numeric; u text; c jsonb; b numeric;
begin
  select user_id into uid from public.health_tokens where token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex');
  if uid is null then raise exception 'invalid health token'; end if;
  rows := case when jsonb_typeof(payload) = 'array' then payload
               when payload ? 'rows' then payload->'rows'
               else jsonb_build_array(payload) end;
  if jsonb_array_length(rows) > 400 then raise exception 'too many rows (max 400)'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    if jsonb_typeof(r) <> 'object' then continue; end if;
    begin d := left(coalesce(nullif(r->>'date', ''), current_date::text), 10)::date;
    exception when others then continue; end;
    if d > current_date + 1 then continue; end if;
    u := lower(coalesce(r->>'unit', payload->>'unit', 'kg'));
    w := public._hnum(r->>'weight', 20, 700);
    if w is not null and u like 'lb%' then w := w / 2.20462; end if;
    if w is not null and (w < 20 or w > 320) then w := null; end if;
    s := nullif(public._hnum(r->>'sleep', 0, 100000), 0);
    if s is not null and s > 1440 then s := s / 3600; elsif s is not null and s > 24 then s := s / 60; end if;
    b := public._hnum(coalesce(r->>'bf', r->>'body_fat'), 0, 100);
    if b is not null and b <= 1 then b := b * 100; end if;
    if b is not null and (b < 2 or b > 70) then b := null; end if;
    c := null;
    if jsonb_typeof(r->'cardio') = 'array' then
      select jsonb_agg(jsonb_build_object(
          'type', left(coalesce(x->>'type', 'Workout'), 40),
          'min', public._hnum(x->>'min', 1, 1440),
          'kcal', public._hnum(x->>'kcal', 0, 10000),
          'hr', public._hnum(x->>'hr', 30, 230),
          'km', public._hnum(x->>'km', 0, 500)))
        into c from (select x from jsonb_array_elements(r->'cardio') x limit 20) q
        where public._hnum(x->>'min', 1, 1440) is not null;
    end if;
    insert into public.health_daily as h (user_id, date, steps, weight_kg, sleep_h, rhr, hrv, kcal, cardio, body_fat)
    values (uid, d,
      nullif(public._hnum(r->>'steps', 0, 150000), 0)::int, round(w, 2), round(s, 2),
      public._hnum(r->>'rhr', 25, 220), public._hnum(r->>'hrv', 1, 400), nullif(public._hnum(r->>'kcal', 0, 15000), 0)::int, c, round(b, 1))
    on conflict (user_id, date) do update set
      steps = coalesce(excluded.steps, h.steps),
      weight_kg = coalesce(excluded.weight_kg, h.weight_kg),
      sleep_h = coalesce(excluded.sleep_h, h.sleep_h),
      rhr = coalesce(excluded.rhr, h.rhr),
      hrv = coalesce(excluded.hrv, h.hrv),
      kcal = coalesce(excluded.kcal, h.kcal),
      cardio = public._merge_cardio(h.cardio, excluded.cardio),
      body_fat = coalesce(excluded.body_fat, h.body_fat),
      updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'days', n);
end $$;

revoke all on function public._merge_cardio(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.health_ingest(text, jsonb) from public;
grant execute on function public.health_ingest(text, jsonb) to anon, authenticated;

-- 3. Push diagnostics & auto-pruning of persistently failing endpoints (e.g. APNs 400 BadJwtToken / stale VAPID)
alter table public.push_subs add column if not exists fail_count int not null default 0;
alter table public.push_subs add column if not exists last_err text;

create or replace function public.push_result_v2(ok_eps text[], dead_eps text[], fail_eps jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare f jsonb;
begin
  update public.push_subs set last_ok = now(), fail_count = 0, last_err = null where endpoint = any(ok_eps);
  delete from public.push_subs where endpoint = any(dead_eps);
  if jsonb_typeof(fail_eps) = 'array' then
    -- Only endpoint-specific failures (f.count = true) move toward pruning. Server-side faults
    -- (bad VAPID JWT, 401/403, 429, 5xx, network) hit every subscription at once; counting them
    -- would delete every device's subscription after five bad sends.
    for f in select * from jsonb_array_elements(fail_eps) loop
      update public.push_subs
      set fail_count = fail_count + case when coalesce((f->>'count')::boolean, false) then 1 else 0 end,
          last_err = left(coalesce(f->>'err', ''), 200)
      where endpoint = f->>'ep';
    end loop;
    delete from public.push_subs where fail_count >= 5;
  end if;
end $$;

revoke all on function public.push_result_v2(text[], text[], jsonb) from public, anon, authenticated;
grant execute on function public.push_result_v2(text[], text[], jsonb) to service_role;

-- 4. pg_cron stays at 5 seconds. Rest-timer pushes (push_timer) enqueue with kick = false and a future
-- due_at, so the cron tick is their only delivery path: 15 s would make the locked-screen "rest is over"
-- alert up to 15 s late. An idle tick is one indexed exists() check (push_queue_due), and pg_net is
-- only called when something is due.
select cron.unschedule(jobid) from cron.job where jobname = 'elite-push';
select cron.schedule('elite-push', '5 seconds', 'select public.push_kick()');
