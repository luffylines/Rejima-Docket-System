'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, ShieldCheck, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';

const ROLES = ['admin', 'manager', 'member', 'viewer'];

function niceDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value));
}

export default function TeamMembersPanel({ currentUserId }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'member' });

  useEffect(() => { loadMembers(); }, []);

  async function request(method = 'GET', body) {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');

    const response = await fetch('/api/admin/users', {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed.');
    return payload;
  }

  async function loadMembers() {
    setLoading(true);
    setMessage('');
    try {
      const data = await request();
      setMembers(data.members || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function createMember(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await request('POST', form);
      setForm({ fullName: '', email: '', password: '', role: 'member' });
      setShowCreate(false);
      setMessage('Account created successfully. The team member can sign in now.');
      await loadMembers();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(member, patch) {
    setSaving(true);
    setMessage('');
    try {
      await request('PATCH', { userId: member.id, ...patch });
      setMessage('Team account updated.');
      await loadMembers();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(() => ({
    total: members.length,
    active: members.filter((member) => member.status === 'active').length,
    disabled: members.filter((member) => member.status === 'disabled').length,
    admins: members.filter((member) => member.role === 'admin').length,
  }), [members]);

  return <>
    <section className="team-hero">
      <div><p className="eyebrow">ADMINISTRATION</p><h3>Team access control</h3><p>Create and manage Rejima accounts without opening the Supabase dashboard.</p></div>
      <button className="primary-btn" onClick={() => setShowCreate(true)}><UserPlus size={18} /> Create account</button>
    </section>

    <section className="team-stats">
      <article><span>Total members</span><strong>{counts.total}</strong></article>
      <article><span>Active</span><strong>{counts.active}</strong></article>
      <article><span>Disabled</span><strong>{counts.disabled}</strong></article>
      <article><span>Admins</span><strong>{counts.admins}</strong></article>
    </section>

    {message && <div className="team-message"><CheckCircle2 size={16} /> <span>{message}</span></div>}

    <section className="content-card team-card">
      <div className="content-head"><div><h3>Team members</h3><p>Only administrators can create accounts or change access.</p></div><button className="secondary-btn" onClick={loadMembers} disabled={loading}><RefreshCw size={16} /> Refresh</button></div>
      {loading ? <div className="empty-state"><RefreshCw className="spin-icon" size={34} /><h4>Loading team accounts…</h4></div> : !members.length ? <div className="empty-state"><UserPlus size={40} /><h4>No team accounts yet</h4></div> : <div className="team-list">{members.map((member) => {
        const isSelf = member.id === currentUserId;
        return <article className="team-member" key={member.id}>
          <div className="team-avatar">{(member.full_name || member.email || 'U')[0].toUpperCase()}</div>
          <div className="team-identity"><div><strong>{member.full_name || 'Unnamed user'}</strong>{isSelf && <span className="you-chip">You</span>}</div><span>{member.email || 'No email available'}</span><small>Joined {niceDate(member.created_at)} • Last sign-in {niceDate(member.last_sign_in_at)}</small></div>
          <div className="team-controls">
            <label>Role<select value={member.role} disabled={saving || isSelf} onChange={(e) => updateMember(member, { role: e.target.value })}>{ROLES.map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}</select></label>
            <div className={`member-status ${member.status}`}>{member.status === 'active' ? <UserCheck size={15} /> : <UserX size={15} />}{member.status}</div>
            {!isSelf && <button className={member.status === 'active' ? 'danger-outline' : 'secondary-btn'} disabled={saving} onClick={() => updateMember(member, { status: member.status === 'active' ? 'disabled' : 'active' })}>{member.status === 'active' ? <><UserX size={16} /> Disable</> : <><UserCheck size={16} /> Reactivate</>}</button>}
          </div>
        </article>;
      })}</div>}
    </section>

    {showCreate && <div className="modal-backdrop"><form className="member-modal" onSubmit={createMember}>
      <div className="modal-head"><div><p className="eyebrow">ADMIN ONLY</p><h3>Create team account</h3></div><button type="button" className="icon-btn" onClick={() => !saving && setShowCreate(false)}><X /></button></div>
      <div className="admin-security-note"><ShieldCheck size={18} /><span>This creates a real Supabase Auth account. The password is never stored in the Rejima database.</span></div>
      <div className="member-form">
        <label>Full name<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Juan Dela Cruz" /></label>
        <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="juan@company.com" /></label>
        <label>Password<input type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimum 8 characters" /></label>
        <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}</select></label>
      </div>
      <div className="role-guide"><span><b>Admin</b> full system + account management</span><span><b>Manager</b> document management</span><span><b>Member</b> upload/manage documents</span><span><b>Viewer</b> view/download only</span></div>
      <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => !saving && setShowCreate(false)}>Cancel</button><button className="primary-btn" disabled={saving}><Plus size={17} /> {saving ? 'Creating…' : 'Create account'}</button></div>
    </form></div>}
  </>;
}
