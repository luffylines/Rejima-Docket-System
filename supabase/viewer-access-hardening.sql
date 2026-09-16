-- Apply this once to an EXISTING Rejima Supabase project.
-- It changes viewer access without recreating tables.

-- Viewers: active + Internal documents only.
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

-- Viewers cannot read workspace-wide audit history.
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

-- Keep download audit logging available to active viewers.
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

-- Viewer Storage access follows the same document visibility rules.
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
