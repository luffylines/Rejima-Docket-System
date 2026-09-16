-- Rejima Docket System: require a destination folder for every NEW upload.
-- Existing legacy dockets without folder_id are preserved.
-- Run this once AFTER supabase/folders-and-sharing.sql.

-- Replace insert policy so authenticated app users cannot create root-level dockets.
drop policy if exists "Active team can create dockets" on public.dockets;
create policy "Active team can create dockets"
on public.dockets for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and folder_id is not null
  and private.can_edit_folder(folder_id)
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
        )
      )
  )
);

-- Keep the rule explicit for future maintenance: legacy rows may remain at root,
-- but every new authenticated upload must point to an accessible editable folder.
comment on column public.dockets.folder_id is
  'Destination folder. Required by RLS for all new authenticated uploads; legacy root rows may be null.';
