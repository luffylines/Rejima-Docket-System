-- Rejima Docket System: 15-day Folder Recycle Bin retention
-- Run ONCE after folders-and-sharing.sql.
-- Deleted folders are hidden from shared users, restorable for 15 days,
-- then permanently purged by the existing maintenance cron.

alter table public.folders
  add column if not exists status text not null default 'active',
  add column if not exists deleted_at timestamptz,
  add column if not exists delete_after timestamptz;

-- Add the status constraint only if it does not already exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'folders_status_check'
      and conrelid = 'public.folders'::regclass
  ) then
    alter table public.folders
      add constraint folders_status_check check (status in ('active','deleted'));
  end if;
end $$;

update public.folders
set status = 'active'
where status is null;

create index if not exists folders_delete_after_idx
  on public.folders(delete_after)
  where status = 'deleted';

create or replace function private.set_folder_recycle_retention()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'deleted' then
    if old.status is distinct from 'deleted' or new.delete_after is null then
      new.deleted_at = now();
      new.delete_after = now() + interval '15 days';
    end if;
  else
    new.deleted_at = null;
    new.delete_after = null;
  end if;

  return new;
end;
$$;

revoke all on function private.set_folder_recycle_retention() from public, anon, authenticated;

drop trigger if exists folders_recycle_retention on public.folders;
create trigger folders_recycle_retention
before update of status on public.folders
for each row execute function private.set_folder_recycle_retention();

-- Shared users may only read active folders. Owners/Admin/Managers can still
-- see deleted folders so they can restore them before the deadline.
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
          select 1
          from public.folder_shares fs
          join public.folders f on f.id = fs.folder_id
          where fs.folder_id = target_folder
            and fs.user_id = auth.uid()
            and f.status = 'active'
        )
      )
  );
$$;

-- Editing/uploading is allowed only while a folder is active.
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
    join public.folders f on f.id = target_folder
    where p.id = auth.uid()
      and p.status = 'active'
      and f.status = 'active'
      and (
        p.role in ('admin','manager')
        or f.owner_id = auth.uid()
        or exists (
          select 1 from public.folder_shares fs
          where fs.folder_id = target_folder
            and fs.user_id = auth.uid()
            and fs.permission = 'editor'
        )
      )
  );
$$;

-- Owners/Admin/Managers may manage active or deleted folders so restore works.
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
grant execute on function private.can_read_folder(uuid) to authenticated;
grant execute on function private.can_edit_folder(uuid) to authenticated;
grant execute on function private.can_manage_folder(uuid) to authenticated;

-- Hide files that belong to a deleted folder from Member/Viewer accounts.
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
            (
              public.dockets.uploaded_by = auth.uid()
              and (
                public.dockets.folder_id is null
                or exists (
                  select 1 from public.folders f
                  where f.id = public.dockets.folder_id and f.status = 'active'
                )
              )
            )
            or (
              public.dockets.folder_id is not null
              and private.can_read_folder(public.dockets.folder_id)
              and exists (
                select 1 from public.folders f
                where f.id = public.dockets.folder_id and f.status = 'active'
              )
            )
          )
        )
        or (
          p.role = 'viewer'
          and public.dockets.status <> 'deleted'
          and public.dockets.folder_id is not null
          and private.can_read_folder(public.dockets.folder_id)
          and exists (
            select 1 from public.folders f
            where f.id = public.dockets.folder_id and f.status = 'active'
          )
        )
      )
  )
);
