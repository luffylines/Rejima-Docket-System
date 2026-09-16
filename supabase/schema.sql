-- Rejima Docket System - production Supabase schema
-- Run this in the SQL Editor of the NEW Rejima Supabase project.
-- The docket-files bucket is PRIVATE. Never make it public.

create extension if not exists pgcrypto;
create schema if not exists private;

create sequence if not exists public.docket_number_seq start 1;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'member' check (role in ('admin','manager','member','viewer')),
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dockets (
  id uuid primary key default gen_random_uuid(),
  docket_number text not null unique default (
    'RDS-' || extract(year from now())::int::text || '-' || lpad(nextval('public.docket_number_seq')::text, 6, '0')
  ),
  title text not null,
  category text not null default 'Others',
  department text not null default 'Others',
  confidentiality text not null default 'Internal' check (confidentiality in ('Internal','Confidential','Restricted')),
  status text not null default 'active' check (status in ('active','archived','deleted')),
  document_date date,
  notes text,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint not null default 0 check (file_size >= 0),
  mime_type text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  docket_id uuid references public.dockets(id) on delete set null,
  detail text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists dockets_status_idx on public.dockets(status);
create index if not exists dockets_created_at_idx on public.dockets(created_at desc);
create index if not exists dockets_category_idx on public.dockets(category);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_docket_id_idx on public.audit_logs(docket_id);

-- New Auth users are intentionally PENDING until an admin approves them.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Team Member'), '@', 1)),
    'member',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Keep updated_at consistent.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function private.touch_updated_at();

drop trigger if exists dockets_touch_updated_at on public.dockets;
create trigger dockets_touch_updated_at before update on public.dockets
for each row execute function private.touch_updated_at();

-- RLS is mandatory on every exposed public table.
alter table public.profiles enable row level security;
alter table public.dockets enable row level security;
alter table public.audit_logs enable row level security;

-- Each signed-in user can read only their own account/profile row.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

-- Admin/manager/member can read all dockets. Viewers can only read active Internal dockets.
drop policy if exists "Active team can read dockets" on public.dockets;
create policy "Active team can read dockets"
on public.dockets for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role in ('admin','manager','member')
        or (
          p.role = 'viewer'
          and public.dockets.status = 'active'
          and public.dockets.confidentiality = 'Internal'
        )
      )
  )
);

-- Active non-viewers can create dockets only as themselves.
drop policy if exists "Active team can create dockets" on public.dockets;
create policy "Active team can create dockets"
on public.dockets for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active' and p.role in ('admin','manager','member')
  )
);

-- Active non-viewers can update docket metadata/status. Physical file deletion is separate.
drop policy if exists "Active team can update dockets" on public.dockets;
create policy "Active team can update dockets"
on public.dockets for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active' and p.role in ('admin','manager','member')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active' and p.role in ('admin','manager','member')
  )
);

-- Audit trail: viewer accounts do not get workspace-wide audit history.
drop policy if exists "Active team can read audit logs" on public.audit_logs;
create policy "Active team can read audit logs"
on public.audit_logs for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role in ('admin','manager','member')
  )
);

-- All active users, including viewers, may append their own download/view actions.
drop policy if exists "Active users can append own audit logs" on public.audit_logs;
create policy "Active users can append own audit logs"
on public.audit_logs for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  )
);

-- Explicit Data API grants. RLS still decides which rows are accessible.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.dockets to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant usage, select on sequence public.docket_number_seq to authenticated;

-- Private storage bucket. 50 MB max per object.
insert into storage.buckets (id, name, public, file_size_limit)
values ('docket-files', 'docket-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- Non-viewers may read all docket files. Viewers may read only files attached to active Internal dockets.
drop policy if exists "Active team can read docket files" on storage.objects;
create policy "Active team can read docket files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'docket-files'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role in ('admin','manager','member')
        or (
          p.role = 'viewer'
          and exists (
            select 1
            from public.dockets d
            where d.storage_path = storage.objects.name
              and d.status = 'active'
              and d.confidentiality = 'Internal'
          )
        )
      )
  )
);

-- Active non-viewers may upload.
drop policy if exists "Active team can upload docket files" on storage.objects;
create policy "Active team can upload docket files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'docket-files'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active' and p.role in ('admin','manager','member')
  )
);

-- Uploaders can remove their own orphaned objects; admins/managers can remove objects when needed.
drop policy if exists "Owners and managers can remove docket files" on storage.objects;
create policy "Owners and managers can remove docket files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'docket-files'
  and (
    owner_id = (select auth.uid())::text
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.status = 'active' and p.role in ('admin','manager')
    )
  )
);

-- BOOTSTRAP AFTER CREATING YOUR FIRST AUTH USER:
-- Replace the UUID below with that user's Auth UID. Run this manually once.
-- update public.profiles set role = 'admin', status = 'active' where id = 'YOUR-FIRST-USER-UUID';

-- To approve another team member later:
-- update public.profiles set status = 'active', role = 'member' where id = 'USER-UUID';
