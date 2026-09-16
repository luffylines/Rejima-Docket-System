'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import styles from './account.module.css';

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [emailForm, setEmailForm] = useState({ email: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', password: '', confirm: '' });
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  useEffect(() => {
    loadAccount();
  }, []);

  async function loadAccount() {
    try {
      const supabase = getSupabase();
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!currentUser) {
        window.location.href = '/';
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role, status')
        .eq('id', currentUser.id)
        .single();
      if (profileError) throw profileError;

      setUser(currentUser);
      setProfile(profileRow);
      setEmailForm((current) => ({ ...current, email: currentUser.email || '' }));
    } catch (err) {
      setError(err.message || 'Unable to load account settings.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCurrentPassword(password) {
    if (!user?.email) throw new Error('No login email is available for this account.');
    const supabase = getSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (signInError) throw new Error('Current password is incorrect.');
  }

  async function logAccountAction(action, detail) {
    try {
      const supabase = getSupabase();
      await supabase.from('audit_logs').insert({
        action,
        docket_id: null,
        detail,
        actor_id: user.id,
      });
    } catch {
      // Account update should not fail only because the audit append failed.
    }
  }

  async function changeEmail(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const nextEmail = emailForm.email.trim().toLowerCase();
    if (!nextEmail || nextEmail === String(user?.email || '').toLowerCase()) {
      setError('Enter a different email address.');
      return;
    }
    if (!emailForm.currentPassword) {
      setError('Enter your current password to continue.');
      return;
    }

    setSavingEmail(true);
    try {
      await verifyCurrentPassword(emailForm.currentPassword);
      const supabase = getSupabase();
      const { data, error: updateError } = await supabase.auth.updateUser({ email: nextEmail });
      if (updateError) throw updateError;

      await logAccountAction('requested email change', 'User requested an account email change.');
      setUser(data.user || user);
      setEmailForm({ email: nextEmail, currentPassword: '' });
      setMessage('Email change submitted. Check your email for any confirmation link required by Supabase before the new address becomes active.');
    } catch (err) {
      setError(err.message || 'Unable to change email.');
    } finally {
      setSavingEmail(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!passwordForm.currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (passwordForm.password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.password !== passwordForm.confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (passwordForm.currentPassword === passwordForm.password) {
      setError('Choose a new password that is different from your current password.');
      return;
    }

    setSavingPassword(true);
    try {
      await verifyCurrentPassword(passwordForm.currentPassword);
      const supabase = getSupabase();
      const { error: updateError } = await supabase.auth.updateUser({ password: passwordForm.password });
      if (updateError) throw updateError;

      await logAccountAction('changed password', 'User changed their account password.');
      setPasswordForm({ currentPassword: '', password: '', confirm: '' });
      setMessage('Password changed successfully. Use the new password the next time you sign in.');
    } catch (err) {
      setError(err.message || 'Unable to change password.');
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return <main className={styles.center}><div className="loader" /><p>Loading account settings…</p></main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} />
      <section className={styles.shell}>
        <a className={styles.back} href="/"><ArrowLeft size={16} /> Back to Rejima</a>

        <header className={styles.header}>
          <div className="brand-mark"><ShieldCheck size={27} /></div>
          <div>
            <p className="eyebrow">ACCOUNT SECURITY</p>
            <h1>Account Settings</h1>
            <p>Manage your own login email and password securely.</p>
          </div>
        </header>

        <section className={styles.identity}>
          <div className={styles.avatar}>{profile?.full_name?.[0] || user?.email?.[0] || 'R'}</div>
          <div>
            <strong>{profile?.full_name || 'Rejima User'}</strong>
            <span>{user?.email}</span>
          </div>
          <div className={styles.badges}>
            <span>{profile?.role || 'member'}</span>
            <span>{profile?.status || 'active'}</span>
          </div>
        </section>

        {message && <div className={styles.success}><CheckCircle2 size={17} /> {message}</div>}
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.grid}>
          <form className={styles.card} onSubmit={changeEmail}>
            <div className={styles.cardHead}><Mail size={20} /><div><h2>Change email</h2><p>Update the email you use to sign in.</p></div></div>
            <label>New email<input type="email" required value={emailForm.email} onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })} /></label>
            <label>Current password<div className={styles.passwordWrap}><input type={showEmailPassword ? 'text' : 'password'} required value={emailForm.currentPassword} onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })} placeholder="Verify your identity" /><button type="button" onClick={() => setShowEmailPassword((value) => !value)} aria-label="Toggle password visibility">{showEmailPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            <div className={styles.note}>Depending on your Supabase Auth settings, the new email may require confirmation before it becomes active.</div>
            <button className="primary-btn" disabled={savingEmail}>{savingEmail ? 'Updating…' : 'Update email'}</button>
          </form>

          <form className={styles.card} onSubmit={changePassword}>
            <div className={styles.cardHead}><KeyRound size={20} /><div><h2>Change password</h2><p>Use at least 8 characters for your new password.</p></div></div>
            <label>Current password<input type={showPasswordFields ? 'text' : 'password'} required value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} /></label>
            <label>New password<input type={showPasswordFields ? 'text' : 'password'} required minLength={8} value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} /></label>
            <label>Confirm new password<input type={showPasswordFields ? 'text' : 'password'} required minLength={8} value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} /></label>
            <label className={styles.toggle}><input type="checkbox" checked={showPasswordFields} onChange={(e) => setShowPasswordFields(e.target.checked)} /> Show passwords</label>
            <button className="primary-btn" disabled={savingPassword}>{savingPassword ? 'Changing…' : 'Change password'}</button>
          </form>
        </div>
      </section>
    </main>
  );
}
