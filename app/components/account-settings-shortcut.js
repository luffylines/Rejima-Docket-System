'use client';

import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { DATA_MODE, getSupabase } from '../../lib/supabase';

export default function AccountSettingsShortcut() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (DATA_MODE !== 'supabase') return;
    const supabase = getSupabase();
    let subscription;

    supabase.auth.getSession().then(({ data }) => setVisible(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setVisible(Boolean(session)));
    subscription = data.subscription;

    return () => subscription?.unsubscribe();
  }, []);

  if (!visible) return null;

  return (
    <a className="account-settings-shortcut" href="/account" title="Account settings" aria-label="Account settings">
      <Settings size={18} />
      <span>Account</span>
    </a>
  );
}
