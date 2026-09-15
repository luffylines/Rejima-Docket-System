import { createClient } from '@supabase/supabase-js';

let client;

export const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE === 'supabase' ? 'supabase' : 'demo';

export function getSupabase() {
  if (DATA_MODE !== 'supabase') return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase mode is enabled but NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.');
  }

  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return client;
}
