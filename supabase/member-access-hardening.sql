-- Apply this ONCE to an EXISTING Rejima Supabase project.
-- It separates Admin, Manager, Member, and Viewer permissions at the database level.
-- Safe to run after viewer-access-hardening.sql; these policies replace the earlier versions.

-- DOCUMENT READ ACCESS
-- Admin/Manager: all dockets.
-- Member: active Internal dockets + only their own archived Internal dockets.
-- Viewer: active Internal dockets only.
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
          and public.dockets.confidentiality = 'Internal'
          and (
            public.dockets.status = 'active'
            or (
              public.dockets.status = 'archived'
              and public.dockets.uploaded_by = (select auth.uid())
            )
          )
        )
        or (
          p.role = 'viewer'
          and public.dockets.status = 'active'
          and public.dockets.confidentiality = 'Internal'
        )
      )
  )
);

-- DOCUMENT CREATION
-- Admin/Manager may create any classification.
-- Member may create Internal dockets only.
-- Viewer cannot create dockets.
drop policy if exists "Active team can create dockets" on public.dockets;
create policy "Active team can create dockets"
on public.dockets for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role in ('admin','manager')
        or (p.role = 'member' and public.dockets.confidentiality = 'Internal')
      )
  )
);

-- DOCUMENT UPDATE
-- Admin/Manager may update any docket.
-- Member may update only their own Internal docket, and may only keep it active/archived.
-- Viewer cannot update dockets.
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

-- AUDIT HISTORY
-- Only Admin/Manager can read workspace-wide audit logs.
-- Members/Viewers still append their own actions so admins/managers retain accountability.
drop policy if exists "Active team can read audit logs" on public.audit_logs;
create policy "Active team can read audit logs"
on public.audit_logs for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role in ('admin','manager')
  )
);

drop policy if exists "Active users can append own audit logs" on public.audit_logs;
create policy "Active users can append own audit logs"
on public.audit_logs for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
  )
);

-- STORAGE READ ACCESS mirrors docket visibility.
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
              and d.confidentiality = 'Internal'
              and (
                d.status = 'active'
                or (d.status = 'archived' and d.uploaded_by = (select auth.uid()))
              )
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

-- STORAGE UPLOAD
-- Admin/Manager/Member can upload objects. Member classification is enforced when the docket row is inserted.
drop policy if exists "Active team can upload docket files" on storage.objects;
create policy "Active team can upload docket files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'docket-files'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role in ('admin','manager','member')
  )
);

-- Keep orphan cleanup / manager removal behavior.
drop policy if exists "Owners and managers can remove docket files" on storage.objects;
create policy "Owners and managers can remove docket files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'docket-files'
  and (
    owner_id = (select auth.uid())::text
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'
        and p.role in ('admin','manager')
    )
  )
);
