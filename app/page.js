'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Archive, CheckCircle2, Cloud, Database, Download, File, FileArchive,
  FileImage, Files, FileSpreadsheet, FileText, FolderOpen, HardDrive, LayoutDashboard,
  LockKeyhole, LogOut, Menu, Search, ShieldCheck, Trash2, UploadCloud, Users, X,
} from 'lucide-react';
import { DATA_MODE, getSupabase } from '../lib/supabase';
import {
  addDemoActivity, createDemoDocketNumber, getDemoDocument, listDemoActivity,
  listDemoDocuments, patchDemoDocument, saveDemoDocument,
} from '../lib/demo-db';
import TeamMembersPanel from './components/team-members';

const navItems = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['documents', 'All Documents', Files],
  ['confidential', 'Confidential', LockKeyhole],
  ['archive', 'Archived', Archive],
  ['trash', 'Recycle Bin', Trash2],
  ['activity', 'Activity Logs', Activity],
];

const memberNavItems = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['documents', 'All Documents', Files],
  ['archive', 'Archived', Archive],
];

const viewerNavItems = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['documents', 'All Documents', Files],
];

const categories = ['Administrative', 'Contracts', 'Finance', 'HR', 'Legal', 'Operations', 'Reports', 'Others'];
const departments = ['Administration', 'Finance', 'Human Resources', 'Legal', 'Management', 'Operations', 'Others'];

function fileIcon(name = '') {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return FileImage;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive;
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return FileText;
  return File;
}

function bytes(size = 0) {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value));
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState(null);
  const [authMessage, setAuthMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState('dashboard');
  const [sidebar, setSidebar] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ category: 'Administrative', department: 'Administration', confidentiality: 'Internal', documentDate: '', notes: '' });
  const inputRef = useRef(null);

  const availableNavItems = profile?.role === 'admin'
    ? [...navItems, ['team', 'Team Members', Users]]
    : profile?.role === 'manager'
      ? navItems
      : profile?.role === 'member'
        ? memberNavItems
        : viewerNavItems;

  const canUploadDocuments = ['admin', 'manager', 'member'].includes(profile?.role);
  const canViewAudit = ['admin', 'manager'].includes(profile?.role);

  useEffect(() => {
    let subscription;
    async function init() {
      if (DATA_MODE === 'demo') {
        const active = localStorage.getItem('rejima-demo-session') === 'true';
        setSignedIn(active);
        if (active) setProfile({ id: 'demo-admin', full_name: 'Demo Team Member', role: 'admin', status: 'active' });
        setReady(true);
        return;
      }

      try {
        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await loadSupabaseProfile(session.user.id);
        const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
          if (nextSession) await loadSupabaseProfile(nextSession.user.id);
          else { setSignedIn(false); setProfile(null); }
        });
        subscription = data.subscription;
      } catch (error) {
        setAuthMessage(error.message);
      } finally {
        setReady(true);
      }
    }
    init();
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (signedIn && profile?.status === 'active') refresh();
  }, [signedIn, profile?.status, profile?.role]);

  useEffect(() => {
    if (!profile) return;
    const allowedViews = availableNavItems.map(([id]) => id);
    if (!allowedViews.includes(view)) setView('dashboard');
  }, [profile?.role, view]);

  async function loadSupabaseProfile(userId) {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('profiles').select('id, full_name, role, status').eq('id', userId).single();
    if (error) throw error;
    setProfile(data);
    setSignedIn(true);
  }

  async function signIn(event) {
    event.preventDefault();
    setAuthMessage('');
    if (DATA_MODE === 'demo') {
      localStorage.setItem('rejima-demo-session', 'true');
      setProfile({ id: 'demo-admin', full_name: 'Demo Team Member', role: 'admin', status: 'active' });
      setSignedIn(true);
      return;
    }
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      setAuthMessage(error.message || 'Unable to sign in.');
    }
  }

  async function logout() {
    if (DATA_MODE === 'demo') localStorage.removeItem('rejima-demo-session');
    else await getSupabase().auth.signOut();
    setSignedIn(false);
    setProfile(null);
  }

  async function refresh() {
    try {
      if (DATA_MODE === 'demo') {
        const demoDocs = await listDemoDocuments();
        if (profile?.role === 'viewer') {
          setDocuments(demoDocs.filter((doc) => doc.status === 'active' && doc.confidentiality === 'Internal'));
          setActivities([]);
          return;
        }
        if (profile?.role === 'member') {
          setDocuments(demoDocs.filter((doc) => doc.confidentiality === 'Internal' && ['active', 'archived'].includes(doc.status)));
          setActivities([]);
          return;
        }
        setDocuments(demoDocs);
        setActivities(await listDemoActivity());
        return;
      }

      const supabase = getSupabase();

      if (profile?.role === 'viewer') {
        const { data: docs, error: docsError } = await supabase
          .from('dockets')
          .select('*')
          .eq('status', 'active')
          .eq('confidentiality', 'Internal')
          .order('created_at', { ascending: false });
        if (docsError) throw docsError;
        setDocuments(docs || []);
        setActivities([]);
        return;
      }

      if (profile?.role === 'member') {
        const { data: docs, error: docsError } = await supabase
          .from('dockets')
          .select('*')
          .eq('confidentiality', 'Internal')
          .in('status', ['active', 'archived'])
          .order('created_at', { ascending: false });
        if (docsError) throw docsError;
        const visible = (docs || []).filter((doc) => doc.status === 'active' || doc.uploaded_by === profile.id);
        setDocuments(visible);
        setActivities([]);
        return;
      }

      const [{ data: docs, error: docsError }, { data: logs, error: logsError }] = await Promise.all([
        supabase.from('dockets').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      if (docsError) throw docsError;
      if (logsError) throw logsError;
      setDocuments(docs || []);
      setActivities(logs || []);
    } catch (error) {
      setNotice(error.message);
    }
  }

  function acceptFiles(fileList) {
    const next = Array.from(fileList || []).filter((file) => file.size <= 50 * 1024 * 1024);
    setSelectedFiles((current) => [...current, ...next]);
  }

  async function uploadDocuments(event) {
    event.preventDefault();
    if (!canUploadDocuments) return;
    if (!selectedFiles.length) return;
    setUploading(true);
    setNotice('');
    try {
      const confidentiality = profile?.role === 'member' ? 'Internal' : form.confidentiality;
      for (const file of selectedFiles) {
        if (DATA_MODE === 'demo') {
          const row = {
            id: crypto.randomUUID(), docket_number: createDemoDocketNumber(), title: file.name,
            category: form.category, department: form.department, confidentiality,
            status: 'active', document_date: form.documentDate || null, notes: form.notes || null,
            file_name: file.name, file_size: file.size, mime_type: file.type || 'application/octet-stream',
            file_blob: file, uploaded_by: profile?.id, uploaded_by_name: profile?.full_name || 'Demo Team Member', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          };
          await saveDemoDocument(row);
          await addDemoActivity('uploaded', row, `Uploaded ${file.name}`);
        } else {
          const supabase = getSupabase();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Your session has expired.');
          const path = `${user.id}/${crypto.randomUUID()}-${sanitize(file.name)}`;
          const { error: storageError } = await supabase.storage.from('docket-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
          if (storageError) throw storageError;
          const { data: docket, error: insertError } = await supabase.from('dockets').insert({
            title: file.name, category: form.category, department: form.department, confidentiality,
            document_date: form.documentDate || null, notes: form.notes || null, storage_path: path,
            file_name: file.name, file_size: file.size, mime_type: file.type || 'application/octet-stream', uploaded_by: user.id,
          }).select().single();
          if (insertError) { await supabase.storage.from('docket-files').remove([path]); throw insertError; }
          await supabase.from('audit_logs').insert({ action: 'uploaded', docket_id: docket.id, detail: `Uploaded ${file.name}`, actor_id: user.id });
        }
      }
      setSelectedFiles([]);
      setShowUpload(false);
      setForm({ category: 'Administrative', department: 'Administration', confidentiality: 'Internal', documentDate: '', notes: '' });
      setNotice(`${selectedFiles.length} document${selectedFiles.length > 1 ? 's' : ''} secured successfully.`);
      await refresh();
    } catch (error) {
      setNotice(error.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function changeStatus(doc, status) {
    if (profile?.role === 'viewer') return;
    if (profile?.role === 'member') {
      if (doc.uploaded_by !== profile.id || status === 'deleted' || !['active', 'archived'].includes(status)) {
        setNotice('Members can archive or restore only documents they uploaded.');
        return;
      }
    }
    try {
      if (DATA_MODE === 'demo') {
        const next = await patchDemoDocument(doc.id, { status });
        await addDemoActivity(status === 'deleted' ? 'moved to recycle bin' : status === 'archived' ? 'archived' : 'restored', next, `${next.title} is now ${status}`);
      } else {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('dockets').update({ status }).eq('id', doc.id);
        if (error) throw error;
        await supabase.from('audit_logs').insert({ action: status === 'deleted' ? 'moved to recycle bin' : status === 'archived' ? 'archived' : 'restored', docket_id: doc.id, detail: `${doc.title} is now ${status}`, actor_id: user.id });
      }
      await refresh();
    } catch (error) { setNotice(error.message); }
  }

  async function downloadDocument(doc) {
    try {
      if (DATA_MODE === 'demo') {
        const stored = await getDemoDocument(doc.id);
        const url = URL.createObjectURL(stored.file_blob);
        const a = document.createElement('a'); a.href = url; a.download = stored.file_name; a.click(); URL.revokeObjectURL(url);
        await addDemoActivity('downloaded', doc, `Downloaded ${doc.file_name}`);
      } else {
        const supabase = getSupabase();
        const { data, error } = await supabase.storage.from('docket-files').createSignedUrl(doc.storage_path, 60);
        if (error) throw error;
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('audit_logs').insert({ action: 'downloaded', docket_id: doc.id, detail: `Downloaded ${doc.file_name}`, actor_id: user.id });
      }
      await refresh();
    } catch (error) { setNotice(error.message); }
  }

  const visibleDocuments = useMemo(() => {
    let rows = documents;
    if (profile?.role === 'viewer') {
      rows = rows.filter((d) => d.status === 'active' && d.confidentiality === 'Internal');
    }
    if (profile?.role === 'member') {
      rows = rows.filter((d) => d.confidentiality === 'Internal' && (d.status === 'active' || d.uploaded_by === profile.id));
    }
    if (view === 'documents' || view === 'dashboard') rows = rows.filter((d) => d.status === 'active');
    if (view === 'confidential') rows = rows.filter((d) => d.status === 'active' && ['Confidential', 'Restricted'].includes(d.confidentiality));
    if (view === 'archive') rows = rows.filter((d) => d.status === 'archived');
    if (view === 'trash') rows = rows.filter((d) => d.status === 'deleted');
    if (category !== 'All') rows = rows.filter((d) => d.category === category);
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((d) => `${d.docket_number} ${d.title} ${d.category} ${d.department}`.toLowerCase().includes(q));
    return rows;
  }, [documents, view, category, query, profile?.role, profile?.id]);

  const stats = useMemo(() => ({
    active: documents.filter((d) => d.status === 'active').length,
    confidential: documents.filter((d) => d.status === 'active' && ['Confidential', 'Restricted'].includes(d.confidentiality)).length,
    archived: documents.filter((d) => d.status === 'archived').length,
    storage: documents.reduce((sum, d) => sum + (Number(d.file_size) || 0), 0),
  }), [documents]);

  if (!ready) return <div className="center-screen"><div className="loader" /><p>Securing workspace…</p></div>;

  if (!signedIn) return (
    <main className="login-shell">
      <div className="login-glow" />
      <section className="login-card">
        <div className="brand-mark"><ShieldCheck size={28} /></div>
        <div><p className="eyebrow">REJIMA • SECURE WORKSPACE</p><h1>Protected documents.<br />Always within reach.</h1></div>
        <p className="muted">Internal docket storage, tracking, recovery, and accountability for your team.</p>
        {DATA_MODE === 'demo' ? (
          <div className="demo-login">
            <div className="mode-card"><HardDrive size={20} /><div><strong>Demo Mode</strong><span>Files stay only in this browser via IndexedDB.</span></div></div>
            <button className="primary-btn full" onClick={signIn}>Enter Demo Workspace</button>
          </div>
        ) : (
          <form onSubmit={signIn} className="login-form">
            <label>Work email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></label>
            <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
            <button className="primary-btn full" type="submit">Secure Sign In</button>
            <small>Accounts are provisioned and approved by a Rejima administrator.</small>
          </form>
        )}
        {authMessage && <div className="error-box">{authMessage}</div>}
        <div className="trust-row"><ShieldCheck size={16} /> Team-only access • Private storage ready • Audit trail</div>
      </section>
    </main>
  );

  if (profile?.status !== 'active') return (
    <main className="login-shell"><section className="login-card"><div className="brand-mark"><LockKeyhole /></div><h1>Access unavailable</h1><p className="muted">Your account is pending approval or has been disabled by an administrator.</p><button className="secondary-btn full" onClick={logout}>Sign out</button></section></main>
  );

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
        <div className="sidebar-head"><div className="brand-mark small"><ShieldCheck /></div><div><strong>Rejima</strong><span>Docket System</span></div><button className="icon-btn mobile-only" onClick={() => setSidebar(false)}><X /></button></div>
        <div className="mode-pill">{DATA_MODE === 'demo' ? <HardDrive size={14} /> : <Cloud size={14} />} {DATA_MODE === 'demo' ? 'Local Demo' : 'Secure Cloud'}</div>
        <nav>{availableNavItems.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); setSidebar(false); }}><Icon size={18} /><span>{label}</span>{id === 'trash' && documents.filter((d) => d.status === 'deleted').length > 0 && <b>{documents.filter((d) => d.status === 'deleted').length}</b>}</button>)}</nav>
        <div className="sidebar-footer"><div className="profile-dot">{profile?.full_name?.[0] || 'R'}</div><div><strong>{profile?.full_name || 'Team Member'}</strong><span>{profile?.role || 'Member'}</span></div><button className="icon-btn" onClick={logout} title="Sign out"><LogOut size={17} /></button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setSidebar(true)}><Menu /></button>
          <div><p className="eyebrow">SECURE DOCUMENT OPERATIONS</p><h2>{availableNavItems.find(([id]) => id === view)?.[1] || 'Dashboard'}</h2></div>
          {canUploadDocuments && view !== 'team' && <div className="top-actions"><button className="primary-btn" onClick={() => setShowUpload(true)}><UploadCloud size={18} /> Upload documents</button></div>}
        </header>

        {DATA_MODE === 'demo' && <div className="demo-banner"><Database size={17} /><span><strong>Demo storage is active.</strong> Uploaded files are saved only in this browser. Connect the new Supabase project before production use.</span></div>}
        {notice && <button className="notice" onClick={() => setNotice('')}><CheckCircle2 size={17} />{notice}<X size={15} /></button>}

        {view === 'dashboard' && <>
          <section className="hero-card"><div><p className="eyebrow">DOCUMENT CONTROL CENTER</p><h3>Every important file, secured and traceable.</h3><p>Use Rejima as the team’s digital backup when physical records are misplaced, damaged, or unavailable.</p></div>{canUploadDocuments ? <button className="hero-upload" onClick={() => setShowUpload(true)}><UploadCloud size={28} /><span>Drop & secure files</span><small>{profile?.role === 'member' ? 'Members upload Internal documents only' : 'PDF, Word, Excel, images, ZIP and more'}</small></button> : <div className="hero-upload"><LockKeyhole size={28} /><span>View-only access</span><small>You can review and download approved internal documents.</small></div>}</section>
          <section className="stats-grid">
            <article><div className="stat-icon"><Files /></div><div><span>Active dockets</span><strong>{stats.active}</strong></div></article>
            {['admin', 'manager'].includes(profile?.role) && <article><div className="stat-icon"><LockKeyhole /></div><div><span>Confidential</span><strong>{stats.confidential}</strong></div></article>}
            {profile?.role !== 'viewer' && <article><div className="stat-icon"><Archive /></div><div><span>Archived</span><strong>{stats.archived}</strong></div></article>}
            <article><div className="stat-icon"><HardDrive /></div><div><span>Storage used</span><strong>{bytes(stats.storage)}</strong></div></article>
          </section>
        </>}

        {view === 'activity' && canViewAudit ? <ActivityPanel activities={activities} /> : view === 'team' && profile?.role === 'admin' ? <TeamMembersPanel currentUserId={profile.id} /> : <section className="content-card">
          <div className="content-head"><div><h3>{view === 'dashboard' ? 'Recent documents' : availableNavItems.find(([id]) => id === view)?.[1]}</h3><p>{visibleDocuments.length} record{visibleDocuments.length !== 1 ? 's' : ''}</p></div><div className="filters"><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search docket, title, department…" /></label><select value={category} onChange={(e) => setCategory(e.target.value)}><option>All</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div></div>
          <DocumentTable rows={view === 'dashboard' ? visibleDocuments.slice(0, 6) : visibleDocuments} view={view} onDownload={downloadDocument} onStatus={changeStatus} role={profile?.role} currentUserId={profile?.id} />
        </section>}
      </section>

      {sidebar && <button className="sidebar-backdrop" onClick={() => setSidebar(false)} aria-label="Close menu" />}
      {showUpload && canUploadDocuments && <UploadModal files={selectedFiles} setFiles={setSelectedFiles} form={form} setForm={setForm} uploading={uploading} dragging={dragging} setDragging={setDragging} inputRef={inputRef} acceptFiles={acceptFiles} role={profile?.role} onClose={() => { if (!uploading) { setShowUpload(false); setSelectedFiles([]); } }} onSubmit={uploadDocuments} />}
    </main>
  );
}

function DocumentTable({ rows, view, onDownload, onStatus, role, currentUserId }) {
  if (!rows.length) return <div className="empty-state"><FolderOpen size={40} /><h4>No documents here yet</h4><p>Uploaded documents will appear here with their docket number and tracking details.</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>Document</th><th>Category</th><th>Security</th><th>Uploaded</th><th>Status</th><th /></tr></thead><tbody>{rows.map((doc) => {
    const Icon = fileIcon(doc.file_name);
    const canManageAll = ['admin', 'manager'].includes(role);
    const canManageOwn = role === 'member' && doc.uploaded_by === currentUserId;
    return <tr key={doc.id}><td><div className="doc-cell"><div className="file-icon"><Icon size={20} /></div><div><strong>{doc.title}</strong><span>{doc.docket_number} • {bytes(doc.file_size)}</span></div></div></td><td><span className="category-chip">{doc.category}</span><small>{doc.department}</small></td><td><span className={`security-chip ${doc.confidentiality?.toLowerCase()}`}>{doc.confidentiality}</span></td><td><span>{formatDate(doc.created_at)}</span><small>{doc.uploaded_by_name || 'Team member'}</small></td><td><span className={`status-chip ${doc.status}`}>{doc.status}</span></td><td><div className="row-actions"><button title="Download" onClick={() => onDownload(doc)}><Download size={17} /></button>{canManageAll && (view === 'archive' || view === 'trash' ? <button title="Restore" onClick={() => onStatus(doc, 'active')}>↺</button> : <><button title="Archive" onClick={() => onStatus(doc, 'archived')}><Archive size={17} /></button><button title="Recycle" onClick={() => onStatus(doc, 'deleted')}><Trash2 size={17} /></button></>)}{canManageOwn && (view === 'archive' ? <button title="Restore your document" onClick={() => onStatus(doc, 'active')}>↺</button> : <button title="Archive your document" onClick={() => onStatus(doc, 'archived')}><Archive size={17} /></button>)}</div></td></tr>;
  })}</tbody></table></div>;
}

function ActivityPanel({ activities }) {
  return <section className="content-card"><div className="content-head"><div><h3>Audit activity</h3><p>Recent document and account actions across the workspace</p></div></div>{!activities.length ? <div className="empty-state"><Activity size={40} /><h4>No activity yet</h4><p>Uploads, downloads, archives, restores, and team changes will be recorded here.</p></div> : <div className="activity-list">{activities.map((item) => <article key={item.id}><div className="activity-icon"><Activity size={16} /></div><div><strong>{item.actor_name || 'Team member'} {item.action}</strong><span>{item.document_title || item.detail || 'Workspace activity'}</span></div><time>{formatDate(item.created_at)}</time></article>)}</div>}</section>;
}

function UploadModal({ files, setFiles, form, setForm, uploading, dragging, setDragging, inputRef, acceptFiles, role, onClose, onSubmit }) {
  const securityOptions = role === 'member' ? ['Internal'] : ['Internal', 'Confidential', 'Restricted'];
  return <div className="modal-backdrop"><form className="upload-modal" onSubmit={onSubmit}><div className="modal-head"><div><p className="eyebrow">SECURE INTAKE</p><h3>Upload documents</h3></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div>
    <button type="button" className={`drop-zone ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFiles(e.dataTransfer.files); }}><UploadCloud size={34} /><strong>Drag & drop files here</strong><span>or tap to browse • up to 50 MB per file</span><input ref={inputRef} type="file" multiple hidden onChange={(e) => acceptFiles(e.target.files)} /></button>
    {!!files.length && <div className="selected-files">{files.map((file, i) => { const Icon = fileIcon(file.name); return <div key={`${file.name}-${i}`}><Icon size={18} /><span><strong>{file.name}</strong><small>{bytes(file.size)}</small></span><button type="button" onClick={() => setFiles(files.filter((_, index) => index !== i))}><X size={15} /></button></div>; })}</div>}
    <div className="form-grid"><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Department<select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>{departments.map((item) => <option key={item}>{item}</option>)}</select></label><label>Security<select value={role === 'member' ? 'Internal' : form.confidentiality} disabled={role === 'member'} onChange={(e) => setForm({ ...form, confidentiality: e.target.value })}>{securityOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label>Document date<input type="date" value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} /></label><label className="wide">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional description or reference details" /></label></div>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={!files.length || uploading}>{uploading ? 'Securing files…' : `Secure ${files.length || ''} file${files.length === 1 ? '' : 's'}`}</button></div>
  </form></div>;
}