-- Elite OS v4: fault-tolerant Health ingest. Run after v3.1-health-cardio.sql. Safe to re-run.
-- Additive only: one new nullable column and a replaced function. Older app builds keep working.
alter table public.health_daily add column if not exists body_fat numeric;

-- payload: one day {date, steps, weight, unit, sleep, rhr, hrv, kcal, bf, cardio}, a list of those, or {rows:[...]}.
-- Rule: a value that is missing, blank, zero or out of range is treated as "not sent" and never replaces a stored value.
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
      cardio = coalesce(excluded.cardio, h.cardio),
      body_fat = coalesce(excluded.body_fat, h.body_fat),
      updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'days', n);
end $$;

revoke all on function public.health_ingest(text, jsonb) from public;
grant execute on function public.health_ingest(text, jsonb) to anon, authenticated;
