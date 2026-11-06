-- Elite OS v3.2: unread message tracking + opt-in progress photo sharing with a coach. Safe to re-run. (Applied 2026-11-06.)
alter table public.coach_links add column if not exists coach_read_at  timestamptz not null default now();
alter table public.coach_links add column if not exists client_read_at timestamptz not null default now();
alter table public.coach_links add column if not exists share_photos   boolean     not null default false;

-- Marks the conversation read for whichever side the caller is on.
create or replace function public.msg_read(coach uuid, client uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = coach then update public.coach_links set coach_read_at = now() where coach_id = coach and client_id = client;
  elsif auth.uid() = client then update public.coach_links set client_read_at = now() where coach_id = coach and client_id = client;
  else raise exception 'not your conversation'; end if;
end $$;

-- Client turns photo sharing on or off for all their coaches.
create or replace function public.set_photo_share(on_ boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.coach_links set share_photos = coalesce(on_, false) where client_id = auth.uid();
end $$;

revoke all on function public.msg_read(uuid, uuid) from public, anon;
revoke all on function public.set_photo_share(boolean) from public, anon;
grant execute on function public.msg_read(uuid, uuid) to authenticated;
grant execute on function public.set_photo_share(boolean) to authenticated;

-- Private bucket: <user id>/<photo id>_<pose>_<yyyy-mm-dd>.jpg, 2 MB max, JPEG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "photos own select" on storage.objects;
drop policy if exists "photos own insert" on storage.objects;
drop policy if exists "photos own update" on storage.objects;
drop policy if exists "photos own delete" on storage.objects;
drop policy if exists "photos coach select" on storage.objects;
create policy "photos own select" on storage.objects for select to authenticated using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos own insert" on storage.objects for insert to authenticated with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos own update" on storage.objects for update to authenticated using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos own delete" on storage.objects for delete to authenticated using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos coach select" on storage.objects for select to authenticated using (
  bucket_id = 'progress-photos' and exists (
    select 1 from public.coach_links l
    where l.coach_id = auth.uid() and l.client_id::text = (storage.foldername(name))[1] and l.share_photos));
