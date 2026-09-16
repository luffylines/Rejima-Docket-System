-- Apply this once to an EXISTING Rejima Supabase project.
-- Archived dockets receive a 15-day retention window before permanent purge.

alter table public.dockets
  add column if not exists archived_at timestamptz,
  add column if not exists delete_after timestamptz;

create index if not exists dockets_delete_after_idx
  on public.dockets(delete_after)
  where status = 'archived';

-- Existing archived files get a fresh 15-day grace period from migration time.
update public.dockets
set archived_at = coalesce(archived_at, now()),
    delete_after = coalesce(delete_after, now() + interval '15 days')
where status = 'archived';

create or replace function private.set_archive_retention()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'archived' then
    if old.status is distinct from 'archived' or new.delete_after is null then
      new.archived_at = now();
      new.delete_after = now() + interval '15 days';
    end if;
  else
    new.archived_at = null;
    new.delete_after = null;
  end if;

  return new;
end;
$$;

revoke all on function private.set_archive_retention() from public, anon, authenticated;

drop trigger if exists dockets_archive_retention on public.dockets;
create trigger dockets_archive_retention
before update of status on public.dockets
for each row execute function private.set_archive_retention();
