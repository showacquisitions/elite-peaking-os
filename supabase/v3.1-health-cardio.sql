-- Elite OS v3.1: Health workouts as cardio. Run after v3.sql. Safe to re-run. (Applied 2026-11-06.)
-- The health edge function (supabase/functions/health) calls health_ingest with the publishable key.
alter table public.health_daily add column if not exists cardio jsonb;

-- Called by the iPhone Shortcut (or any automation) with the anon key. Auth is the token.
-- payload: one day {date, steps, weight, unit, sleep, rhr, hrv, kcal}, a list of those, or {rows:[...]}.
create or replace function public.health_ingest(token text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; rows jsonb; r jsonb; d date; n int := 0; w numeric; s numeric; u text; c jsonb;
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
    c := null;
    if jsonb_typeof(r->'cardio') = 'array' then
      select coalesce(jsonb_agg(jsonb_build_object(
          'type', left(coalesce(x->>'type', 'Workout'), 40),
          'min', public._hnum(x->>'min', 1, 1440),
          'kcal', public._hnum(x->>'kcal', 0, 10000),
          'hr', public._hnum(x->>'hr', 30, 230),
          'km', public._hnum(x->>'km', 0, 500))), '[]'::jsonb)
        into c from (select x from jsonb_array_elements(r->'cardio') x limit 20) q
        where public._hnum(x->>'min', 1, 1440) is not null;
    end if;
    insert into public.health_daily as h (user_id, date, steps, weight_kg, sleep_h, rhr, hrv, kcal, cardio)
    values (uid, d,
      public._hnum(r->>'steps', 0, 150000)::int, round(w, 2), round(s, 2),
      public._hnum(r->>'rhr', 20, 220), public._hnum(r->>'hrv', 1, 400), public._hnum(r->>'kcal', 0, 15000)::int, c)
    on conflict (user_id, date) do update set
      steps = coalesce(excluded.steps, h.steps),
      weight_kg = coalesce(excluded.weight_kg, h.weight_kg),
      sleep_h = coalesce(excluded.sleep_h, h.sleep_h),
      rhr = coalesce(excluded.rhr, h.rhr),
      hrv = coalesce(excluded.hrv, h.hrv),
      kcal = coalesce(excluded.kcal, h.kcal),
      cardio = coalesce(excluded.cardio, h.cardio),
      updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'days', n);
end $$;

revoke all on function public.health_ingest(text, jsonb) from public;
grant execute on function public.health_ingest(text, jsonb) to anon, authenticated;
