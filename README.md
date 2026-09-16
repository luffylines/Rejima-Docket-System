# Rejima Docket System

Secure internal document storage, docket tracking, recovery, and team access control.

## Production features

- Supabase email/password authentication
- Private `docket-files` Storage bucket
- Row Level Security (RLS)
- Automatic docket numbers
- Drag-and-drop multi-file upload
- Search and filtering
- Confidential / Restricted classifications
- Archive and recycle-bin restore
- Audit activity
- Roles: Admin, Manager, Member, Viewer
- Admin-only Team Members screen
- Create accounts from Rejima
- Change user roles
- Disable and reactivate accounts

## Environment variables

```env
NEXT_PUBLIC_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

`SUPABASE_SECRET_KEY` is **server only**. Never prefix it with `NEXT_PUBLIC_`, never expose it in browser code, and never commit the real value to GitHub.

The app also accepts the legacy `SUPABASE_SERVICE_ROLE_KEY` server environment variable as a fallback.

## Supabase setup

1. Create the Rejima Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Create the first Auth user.
4. Promote that first user once:

```sql
update public.profiles
set role = 'admin', status = 'active'
where id = 'YOUR-FIRST-USER-UUID';
```

5. Add the environment variables to Vercel.
6. Redeploy.

## Admin account management

After signing in as an active admin, open **Team Members** from the sidebar. Admins can create an account with a full name, email, password, and role. Account creation uses a server-only Next.js route and Supabase Admin Auth; the secret key is never sent to the browser.

Disabling a profile immediately blocks access through the Rejima UI and the RLS policies because document and storage access require `profiles.status = 'active'`.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.
