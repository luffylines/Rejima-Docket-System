-- Apply this once to the EXISTING Rejima Supabase project.
-- Members can access only documents they personally uploaded.
-- Admin/Manager keep workspace-wide access. Viewer remains read-only for active Internal documents.

-- Docket visibility by role.
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
        p.role in ('admin','manager')
        or (
          p.role = 'member'
          and public.dockets.uploaded_by = (select auth.uid())
          and public.dockets.confidentiality = 'Internal'
          and public.dockets.status in ('active','archived')
        )
        or (
          p.role = 'viewer'
          and public.dockets.status = 'active'
          and public.dockets.confidentiality = 'Internal'
        )
      )
  )
);

-- Member updates remain limited to their own Internal documents and active/archive states.
drop policy if exists "Active team can update dockets" on public.dockets;
create policy "Active team can update dockets"
on public.dockets for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or (
          p.role = 'member'
          and public.dockets.uploaded_by = (select auth.uid())
          and public.dockets.confidentiality = 'Internal'
          and public.dockets.status in ('active','archived')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or (
          p.role = 'member'
          and public.dockets.uploaded_by = (select auth.uid())
          and public.dockets.confidentiality = 'Internal'
          and public.dockets.status in ('active','archived')
        )
      )
  )
);

-- Storage downloads/previews mirror the docket visibility rules.
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
        p.role in ('admin','manager')
        or (
          p.role = 'member'
          and exists (
            select 1
            from public.dockets d
            where d.storage_path = storage.objects.name
              and d.uploaded_by = (select auth.uid())
              and d.confidentiality = 'Internal'
              and d.status in ('active','archived')
          )
        )
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
