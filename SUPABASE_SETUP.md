# Rejima Supabase Setup

Use a **new Supabase project dedicated to Rejima**. Do not reuse VladzInk or another production database.

## 1. Create the project

Create a new Supabase project in a region appropriate for your team.

## 2. Apply the schema

Open **SQL Editor** in the new project and run the full contents of:

`supabase/schema.sql`

This creates:

- `profiles` for team membership and roles
- `dockets` for document metadata/tracking
- `audit_logs` for document actions
- a private `docket-files` Storage bucket
- RLS policies for authenticated active team members
- sequential docket numbers such as `RDS-2026-000001`

## 3. Create the first user

Create the first user in Supabase Auth. New users intentionally start with `pending` access.

Copy the user's Auth UID and run:

```sql
update public.profiles
set role = 'admin', status = 'active'
where id = 'YOUR-FIRST-USER-UUID';
```

For another approved team member:

```sql
update public.profiles
set role = 'member', status = 'active'
where id = 'USER-UUID';
```

## 4. Configure environment variables

In local development, create `.env.local`:

```env
NEXT_PUBLIC_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Use the **publishable key** only. Never place a service-role/secret key in a `NEXT_PUBLIC_` variable or commit it to GitHub.

For Vercel, add the same three variables in the project's Environment Variables settings and redeploy.

## 5. Security checks before production

- Keep the `docket-files` bucket **Private**.
- Do not disable RLS on `profiles`, `dockets`, or `audit_logs`.
- New accounts must remain `pending` until intentionally approved.
- Do not expose the service-role key in browser code.
- Use HTTPS in production.
- Enable MFA for administrative users when your Supabase Auth setup is ready.

## Demo mode

Until Supabase is connected, leave:

```env
NEXT_PUBLIC_DATA_MODE=demo
```

Demo uploads are stored in that browser's IndexedDB and are only for testing, not for production backup.
