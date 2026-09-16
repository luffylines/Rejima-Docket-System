-- Rejima Docket System: secure folders + inherited folder sharing
-- Run ONCE in the existing Rejima Supabase project.
-- Folder access is enforced by RLS and also controls file reads through dockets/storage.

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folder_shares (
  folder_id uuid not null references public.folders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'viewer' check (permission in ('viewer','editor')),
  shared_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (folder_id, user_id)
);

alter table public.dockets
  add column if not exists folder_id uuid references public.folders(id) on delete set null;

create index if not exists folders_owner_idx on public.folders(owner_id);
create index if not exists folder_shares_user_idx on public.folder_shares(user_id);
create index if not exists folder_shares_folder_idx on public.folder_shares(folder_id);
create index if not exists dockets_folder_idx on public.dockets(folder_id);

-- Keep timestamps current.
drop trigger if exists folders_touch_updated_at on public.folders;
create trigger folders_touch_updated_at
before update on public.folders
for each row execute function private.touch_updated_at();

drop trigger if exists folder_shares_touch_updated_at on public.folder_shares;
create trigger folder_shares_touch_updated_at
before update on public.folder_shares
for each row execute function private.touch_updated_at();

-- SECURITY DEFINER helpers avoid recursive RLS between folders and folder_shares.
create or replace function private.can_read_folder(target_folder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or exists (
          select 1 from public.folders f
          where f.id = target_folder and f.owner_id = auth.uid()
        )
        or exists (
          select 1 from public.folder_shares fs
          where fs.folder_id = target_folder and fs.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function private.can_edit_folder(target_folder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or exists (
          select 1 from public.folders f
          where f.id = target_folder and f.owner_id = auth.uid()
        )
        or exists (
          select 1 from public.folder_shares fs
          where fs.folder_id = target_folder
            and fs.user_id = auth.uid()
            and fs.permission = 'editor'
        )
      )
  );
$$;

create or replace function private.can_manage_folder(target_folder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or exists (
          select 1 from public.folders f
          where f.id = target_folder and f.owner_id = auth.uid()
        )
      )
  );
$$;

revoke all on function private.can_read_folder(uuid) from public, anon;
revoke all on function private.can_edit_folder(uuid) from public, anon;
revoke all on function private.can_manage_folder(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_read_folder(uuid) to authenticated;
grant execute on function private.can_edit_folder(uuid) to authenticated;
grant execute on function private.can_manage_folder(uuid) to authenticated;

alter table public.folders enable row level security;
alter table public.folder_shares enable row level security;

-- Folder visibility: admin/manager, owner, or specifically shared user.
drop policy if exists "Accessible folders are readable" on public.folders;
create policy "Accessible folders are readable"
on public.folders for select
to authenticated
using (private.can_read_folder(id));

-- Admin/Manager/Member can create folders. Viewer accounts cannot.
drop policy if exists "Active users can create folders" on public.folders;
create policy "Active users can create folders"
on public.folders for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','manager','member')
  )
);

-- Owner/Admin/Manager can rename/manage folder metadata.
drop policy if exists "Folder managers can update folders" on public.folders;
create policy "Folder managers can update folders"
on public.folders for update
to authenticated
using (private.can_manage_folder(id))
with check (private.can_manage_folder(id));

-- Shared users can see their own share row. Folder managers can see all shares for that folder.
drop policy if exists "Folder shares are visible to participants" on public.folder_shares;
create policy "Folder shares are visible to participants"
on public.folder_shares for select
to authenticated
using (user_id = auth.uid() or private.can_manage_folder(folder_id));

-- Only owner/admin/manager can add, change, or remove access.
drop policy if exists "Folder managers can add shares" on public.folder_shares;
create policy "Folder managers can add shares"
on public.folder_shares for insert
to authenticated
with check (private.can_manage_folder(folder_id) and shared_by = auth.uid());

drop policy if exists "Folder managers can update shares" on public.folder_shares;
create policy "Folder managers can update shares"
on public.folder_shares for update
to authenticated
using (private.can_manage_folder(folder_id))
with check (private.can_manage_folder(folder_id));

drop policy if exists "Folder managers can remove shares" on public.folder_shares;
create policy "Folder managers can remove shares"
on public.folder_shares for delete
to authenticated
using (private.can_manage_folder(folder_id));

-- Replace docket visibility with private + explicitly shared folder access.
drop policy if exists "Active team can read dockets" on public.dockets;
create policy "Active team can read dockets"
on public.dockets for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or (
          p.role = 'member'
          and public.dockets.status <> 'deleted'
          and (
            public.dockets.uploaded_by = auth.uid()
            or (
              public.dockets.folder_id is not null
              and private.can_read_folder(public.dockets.folder_id)
            )
          )
        )
        or (
          p.role = 'viewer'
          and public.dockets.status <> 'deleted'
          and public.dockets.folder_id is not null
          and private.can_read_folder(public.dockets.folder_id)
        )
      )
  )
);

-- Folder upload is allowed only when the user can edit that folder.
drop policy if exists "Active team can create dockets" on public.dockets;
create policy "Active team can create dockets"
on public.dockets for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or (
          p.role = 'member'
          and public.dockets.confidentiality = 'Internal'
          and (
            public.dockets.folder_id is null
            or private.can_edit_folder(public.dockets.folder_id)
          )
        )
      )
  )
);

-- Members still manage only files they personally uploaded; shared viewer/editor access does not grant delete/archive of another uploader's file.
drop policy if exists "Active team can update dockets" on public.dockets;
create policy "Active team can update dockets"
on public.dockets for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or (
          p.role = 'member'
          and public.dockets.uploaded_by = auth.uid()
          and public.dockets.confidentiality = 'Internal'
          and public.dockets.status in ('active','archived')
          and (
            public.dockets.folder_id is null
            or private.can_edit_folder(public.dockets.folder_id)
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or (
          p.role = 'member'
          and public.dockets.uploaded_by = auth.uid()
          and public.dockets.confidentiality = 'Internal'
          and public.dockets.status in ('active','archived')
          and (
            public.dockets.folder_id is null
            or private.can_edit_folder(public.dockets.folder_id)
          )
        )
      )
  )
);

-- Storage reads mirror docket RLS, including inherited folder shares.
drop policy if exists "Active team can read docket files" on storage.objects;
create policy "Active team can read docket files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'docket-files'
  and exists (
    select 1 from public.dockets d
    where d.storage_path = storage.objects.name
  )
);

-- Explicit API grants; RLS decides which rows each user may actually access.
grant select, insert, update on public.folders to authenticated;
grant select, insert, update, delete on public.folder_shares to authenticated;
grant select, insert, update on public.dockets to authenticated;
