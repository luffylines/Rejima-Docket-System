-- Apply this once to an EXISTING Rejima Supabase project.
-- Recycle Bin items are permanently purged after 15 days.
-- Archived items are retained indefinitely.

alter table public.dockets
  add column if not exists recycled_at timestamptz,
  add column if not exists delete_after timestamptz;

-- Remove the old archive-based retention behavior if it was previously installed.
drop trigger if exists dockets_archive_retention on public.dockets;
drop function if exists private.set_archive_retention();

-- Archived documents must never have an automatic deletion deadline.
update public.dockets
set delete_after = null
where status = 'archived';

-- Existing Recycle Bin items receive a fresh 15-day grace period.
update public.dockets
set recycled_at = coalesce(recycled_at, now()),
    delete_after = coalesce(delete_after, now() + interval '15 days')
where status = 'deleted';

-- Rebuild the retention index specifically for Recycle Bin rows.
drop index if exists public.dockets_delete_after_idx;
create index dockets_delete_after_idx
  on public.dockets(delete_after)
  where status = 'deleted';

create or replace function private.set_recycle_retention()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'deleted' then
    if old.status is distinct from 'deleted' or new.delete_after is null then
      new.recycled_at = now();
      new.delete_after = now() + interval '15 days';
    end if;
  else
    new.recycled_at = null;
    new.delete_after = null;
  end if;

  return new;
end;
$$;

revoke all on function private.set_recycle_retention() from public, anon, authenticated;

drop trigger if exists dockets_recycle_retention on public.dockets;
create trigger dockets_recycle_retention
before update of status on public.dockets
for each row execute function private.set_recycle_retention();
