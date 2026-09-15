# Rejima Docket System

Secure internal document storage, docket tracking, and backup-ready workspace for teams.

## Current mode

The app ships with a fully functional **Demo Mode** that stores uploaded files in the browser using IndexedDB. This lets the team test drag-and-drop uploads, docket numbers, search/filtering, archive, restore, download, and audit activity before a Supabase project is connected.

## Planned production backend

Supabase is prepared as the production backend for:

- Email/password authentication
- Private Storage bucket for documents
- Row Level Security (RLS)
- Team membership and roles
- Docket metadata
- Audit logs
- Soft delete / recycle bin

See `supabase/schema.sql` and `.env.example`.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Production setup later

1. Create a new Supabase project for Rejima.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and add your Supabase URL and publishable key.
4. Set `NEXT_PUBLIC_DATA_MODE=supabase` once the Supabase integration is enabled.
5. Deploy to Vercel.

> Never commit service-role or secret keys. Only use the Supabase publishable key in browser code.
