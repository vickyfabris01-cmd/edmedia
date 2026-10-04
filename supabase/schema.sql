-- EdMedia cloud sync schema. Run once in the Supabase SQL editor (or as a migration).

create table if not exists public.sync_records (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  store      text    not null,
  id         text    not null,
  data       jsonb   not null,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  primary key (user_id, store, id)
);

create index if not exists sync_records_user_updated_idx
  on public.sync_records (user_id, updated_at);

alter table public.sync_records enable row level security;

-- Each person can only see and change their own rows.
create policy "sync_records_select_own" on public.sync_records
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "sync_records_insert_own" on public.sync_records
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "sync_records_update_own" on public.sync_records
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "sync_records_delete_own" on public.sync_records
  for delete to authenticated using ((select auth.uid()) = user_id);
