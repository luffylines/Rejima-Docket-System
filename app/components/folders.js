'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Download, Eye, File, FileArchive, FileImage, FileSpreadsheet, FileText,
  FolderOpen, FolderPlus, LockKeyhole, MoreVertical, Pencil, RotateCcw, Share2, Trash2,
  UploadCloud, UserPlus, Users, X,
} from 'lucide-react';
import { DATA_MODE, getSupabase } from '../../lib/supabase';

const categories = ['Administrative', 'Contracts', 'Finance', 'HR', 'Legal', 'Operations', 'Reports', 'Others'];
const departments = ['Administration', 'Finance', 'Human Resources', 'Legal', 'Management', 'Operations', 'Others'];

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

function retentionSummary(value) {
  if (!value) return '15 days remaining';
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return '15 days remaining';
  const days = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000));
  return `Auto-delete ${formatDate(value)} • ${days} day${days === 1 ? '' : 's'} left`;
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function fileIcon(name = '') {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return FileImage;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive;
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return FileText;
  return File;
}

function previewKind(doc) {
  const mime = String(doc?.mime_type || '').toLowerCase();
  const ext = String(doc?.file_name || '').split('.').pop()?.toLowerCase();
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('text/') || ['txt', 'csv'].includes(ext)) return 'text';
  return 'other';
}

export default function FoldersPanel({ profile, onNotice }) {
  const [folders, setFolders] = useState([]);
  const [shares, setShares] = useState([]);
  const [fileSummary, setFileSummary] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderDocs, setFolderDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null);
  const [trashMode, setTrashMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameFolder, setRenameFolder] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
  const [shareFolder, setShareFolder] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [folderShareRows, setFolderShareRows] = useState([]);
  const [shareUserId, setShareUserId] = useState('');
  const [sharePermission, setSharePermission] = useState('viewer');
  const [savingShare, setSavingShare] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ category: 'Administrative', department: 'Administration', confidentiality: 'Internal', documentDate: '', notes: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (DATA_MODE === 'supabase' && profile?.id) loadFolders();
    else setLoading(false);
  }, [profile?.id, profile?.role]);

  async function loadFolders() {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const [{ data: folderRows, error: folderError }, { data: shareRows, error: shareError }, { data: docs, error: docsError }] = await Promise.all([
        supabase.from('folders').select('*').order('updated_at', { ascending: false }),
        supabase.from('folder_shares').select('folder_id,user_id,permission,shared_by,created_at,updated_at'),
        supabase.from('dockets').select('id,folder_id,status,file_size').not('folder_id', 'is', null),
      ]);
      if (folderError) throw folderError;
      if (shareError) throw shareError;
      if (docsError) throw docsError;
      setFolders(folderRows || []);
      setShares(shareRows || []);
      setFileSummary((docs || []).filter((doc) => doc.status !== 'deleted'));
      if (selectedFolder) {
        const fresh = (folderRows || []).find((folder) => folder.id === selectedFolder.id);
        if (fresh?.status === 'deleted') {
          setSelectedFolder(null);
          setFolderDocs([]);
        } else if (fresh) {
          setSelectedFolder(fresh);
        }
      }
    } catch (error) {
      onNotice?.(error.message || 'Unable to load folders.');
    } finally {
      setLoading(false);
    }
  }

  function myShare(folderId) {
    return shares.find((row) => row.folder_id === folderId && row.user_id === profile?.id);
  }

  function accessFor(folder) {
    if (['admin', 'manager'].includes(profile?.role)) return profile.role;
    if (folder.owner_id === profile?.id) return 'owner';
    return myShare(folder.id)?.permission || 'viewer';
  }

  function canManage(folder) {
    return ['admin', 'manager'].includes(profile?.role) || folder.owner_id === profile?.id;
  }

  function canEdit(folder) {
    if (folder.status === 'deleted') return false;
    if (canManage(folder)) return true;
    return myShare(folder.id)?.permission === 'editor';
  }

  function folderCount(folderId) {
    return fileSummary.filter((doc) => doc.folder_id === folderId).length;
  }

  function folderSize(folderId) {
    return fileSummary.filter((doc) => doc.folder_id === folderId).reduce((sum, doc) => sum + Number(doc.file_size || 0), 0);
  }

  async function logFolderAction(action, detail) {
    try {
      const supabase = getSupabase();
      await supabase.from('audit_logs').insert({ action, docket_id: null, detail, actor_id: profile.id });
    } catch {
      // Folder action itself should not fail only because the audit append failed.
    }
  }

  async function createFolder(event) {
    event.preventDefault();
    const name = createName.trim();
    if (!name) return;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('folders').insert({ name, owner_id: profile.id }).select().single();
      if (error) throw error;
      await logFolderAction('created folder', `Created folder ${name}`);
      setCreateOpen(false);
      setCreateName('');
      setTrashMode(false);
      await loadFolders();
      setSelectedFolder(data);
      await loadFolderDocs(data.id);
      onNotice?.(`Folder “${name}” created.`);
    } catch (error) {
      onNotice?.(error.message || 'Unable to create folder.');
    }
  }

  async function saveRename(event) {
    event.preventDefault();
    const name = renameName.trim();
    if (!renameFolder || !name) return;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('folders').update({ name }).eq('id', renameFolder.id).select().single();
      if (error) throw error;
      await logFolderAction('renamed folder', `Renamed folder to ${name}`);
      if (selectedFolder?.id === data.id) setSelectedFolder(data);
      setRenameFolder(null);
      setRenameName('');
      await loadFolders();
      onNotice?.(`Folder renamed to “${name}”.`);
    } catch (error) {
      onNotice?.(error.message || 'Unable to rename folder.');
    }
  }

  async function deleteFolder() {
    const folder = deleteFolderTarget;
    if (!folder || !canManage(folder)) return;
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('folders').update({ status: 'deleted' }).eq('id', folder.id);
      if (error) throw error;
      await logFolderAction('moved folder to recycle bin', `${folder.name} moved to Folder Recycle Bin`);
      setDeleteFolderTarget(null);
      setOpenMenu(null);
      if (selectedFolder?.id === folder.id) {
        setSelectedFolder(null);
        setFolderDocs([]);
      }
      await loadFolders();
      onNotice?.(`Folder “${folder.name}” moved to Folder Recycle Bin. It will be permanently deleted after 15 days.`);
    } catch (error) {
      onNotice?.(error.message || 'Unable to delete folder.');
    }
  }

  async function restoreFolder(folder) {
    if (!canManage(folder)) return;
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('folders').update({ status: 'active' }).eq('id', folder.id);
      if (error) throw error;
      await logFolderAction('restored folder', `Restored folder ${folder.name}`);
      await loadFolders();
      onNotice?.(`Folder “${folder.name}” restored.`);
    } catch (error) {
      onNotice?.(error.message || 'Unable to restore folder.');
    }
  }

  async function openFolder(folder) {
    if (folder.status === 'deleted') return;
    setSelectedFolder(folder);
    setOpenMenu(null);
    await loadFolderDocs(folder.id);
  }

  async function loadFolderDocs(folderId) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('dockets')
        .select('*')
        .eq('folder_id', folderId)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setFolderDocs(data || []);
    } catch (error) {
      onNotice?.(error.message || 'Unable to load folder files.');
    }
  }

  async function openShare(folder) {
    setShareFolder(folder);
    setOpenMenu(null);
    setShareUserId('');
    setSharePermission('viewer');
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session has expired.');
      const [directoryResponse, shareResult] = await Promise.all([
        fetch('/api/team/directory', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        supabase.from('folder_shares').select('folder_id,user_id,permission,shared_by,created_at,updated_at').eq('folder_id', folder.id),
      ]);
      const directoryJson = await directoryResponse.json();
      if (!directoryResponse.ok) throw new Error(directoryJson.error || 'Unable to load team directory.');
      if (shareResult.error) throw shareResult.error;
      setDirectory(directoryJson.members || []);
      setFolderShareRows(shareResult.data || []);
    } catch (error) {
      setShareFolder(null);
      onNotice?.(error.message || 'Unable to open sharing settings.');
    }
  }

  async function saveShare(event) {
    event.preventDefault();
    if (!shareFolder || !shareUserId) return;
    setSavingShare(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('folder_shares').upsert({
        folder_id: shareFolder.id,
        user_id: shareUserId,
        permission: sharePermission,
        shared_by: profile.id,
      }, { onConflict: 'folder_id,user_id' });
      if (error) throw error;
      const person = directory.find((item) => item.id === shareUserId);
      await logFolderAction('shared folder', `${shareFolder.name} shared with ${person?.full_name || 'team member'} as ${sharePermission}`);
      setShareUserId('');
      const { data, error: reloadError } = await supabase.from('folder_shares').select('folder_id,user_id,permission,shared_by,created_at,updated_at').eq('folder_id', shareFolder.id);
      if (reloadError) throw reloadError;
      setFolderShareRows(data || []);
      await loadFolders();
      onNotice?.(`Folder shared with ${person?.full_name || 'team member'}.`);
    } catch (error) {
      onNotice?.(error.message || 'Unable to share folder.');
    } finally {
      setSavingShare(false);
    }
  }

  async function removeShare(row) {
    try {
      const supabase = getSupabase();
      const person = directory.find((item) => item.id === row.user_id);
      const { error } = await supabase.from('folder_shares').delete().eq('folder_id', row.folder_id).eq('user_id', row.user_id);
      if (error) throw error;
      await logFolderAction('removed folder access', `Removed ${person?.full_name || 'team member'} from ${shareFolder?.name || 'folder'}`);
      setFolderShareRows((current) => current.filter((item) => item.user_id !== row.user_id));
      await loadFolders();
      onNotice?.('Folder access removed.');
    } catch (error) {
      onNotice?.(error.message || 'Unable to remove access.');
    }
  }

  function openUpload(folder) {
    if (!canEdit(folder)) return;
    setUploadFiles([]);
    setForm({ category: 'Administrative', department: 'Administration', confidentiality: 'Internal', documentDate: '', notes: '' });
    setUploadOpen(true);
  }

  async function uploadToFolder(event) {
    event.preventDefault();
    if (!selectedFolder || !uploadFiles.length || !canEdit(selectedFolder)) return;
    setUploading(true);
    try {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Your session has expired.');
      const confidentiality = profile.role === 'member' ? 'Internal' : form.confidentiality;

      for (const file of uploadFiles) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} is larger than 50 MB.`);
        const path = `${user.id}/${selectedFolder.id}/${crypto.randomUUID()}-${sanitize(file.name)}`;
        const { error: storageError } = await supabase.storage.from('docket-files').upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        });
        if (storageError) throw storageError;

        const { data: docket, error: insertError } = await supabase.from('dockets').insert({
          title: file.name,
          category: form.category,
          department: form.department,
          confidentiality,
          document_date: form.documentDate || null,
          notes: form.notes || null,
          folder_id: selectedFolder.id,
          storage_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: user.id,
        }).select().single();

        if (insertError) {
          await supabase.storage.from('docket-files').remove([path]);
          throw insertError;
        }

        await supabase.from('audit_logs').insert({
          action: 'uploaded to folder',
          docket_id: docket.id,
          detail: `Uploaded ${file.name} to ${selectedFolder.name}`,
          actor_id: user.id,
        });
      }

      const count = uploadFiles.length;
      setUploadFiles([]);
      setUploadOpen(false);
      await Promise.all([loadFolderDocs(selectedFolder.id), loadFolders()]);
      onNotice?.(`${count} file${count === 1 ? '' : 's'} uploaded to “${selectedFolder.name}”.`);
    } catch (error) {
      onNotice?.(error.message || 'Folder upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function previewDocument(doc) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage.from('docket-files').createSignedUrl(doc.storage_path, 300);
      if (error) throw error;
      setPreview({ doc, url: data.signedUrl, kind: previewKind(doc) });
      await supabase.from('audit_logs').insert({ action: 'previewed', docket_id: doc.id, detail: `Previewed ${doc.file_name} in ${selectedFolder?.name || 'folder'}`, actor_id: profile.id });
    } catch (error) {
      onNotice?.(error.message || 'Unable to preview file.');
    }
  }

  async function downloadDocument(doc) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage.from('docket-files').createSignedUrl(doc.storage_path, 60);
      if (error) throw error;
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
      await supabase.from('audit_logs').insert({ action: 'downloaded', docket_id: doc.id, detail: `Downloaded ${doc.file_name} from ${selectedFolder?.name || 'folder'}`, actor_id: profile.id });
    } catch (error) {
      onNotice?.(error.message || 'Unable to download file.');
    }
  }

  const shareableDirectory = useMemo(() => {
    const sharedIds = new Set(folderShareRows.map((row) => row.user_id));
    return directory.filter((item) => !sharedIds.has(item.id) && item.id !== shareFolder?.owner_id);
  }, [directory, folderShareRows, shareFolder?.owner_id]);

  const activeFolders = useMemo(() => folders.filter((folder) => folder.status !== 'deleted'), [folders]);
  const deletedFolders = useMemo(() => folders.filter((folder) => folder.status === 'deleted'), [folders]);

  if (DATA_MODE !== 'supabase') {
    return <section className="folder-shell"><div className="folder-empty"><FolderOpen size={42} /><h3>Folders require Secure Cloud mode</h3><p>Connect Supabase to use private folders and team sharing.</p></div></section>;
  }

  if (selectedFolder) {
    const access = accessFor(selectedFolder);
    const editable = canEdit(selectedFolder);
    const manageable = canManage(selectedFolder);
    return <section className="folder-shell">
      <div className="folder-toolbar">
        <button className="folder-back" onClick={() => { setSelectedFolder(null); setFolderDocs([]); }}><ArrowLeft size={17} /> Folders</button>
        <div className="folder-title-block"><div className="folder-main-icon"><FolderOpen size={25} /></div><div><h3>{selectedFolder.name}</h3><p>{access === 'owner' ? 'You own this folder' : access === 'admin' || access === 'manager' ? `${access} oversight` : `Shared with you • ${access}`}</p></div></div>
        <div className="folder-toolbar-actions">
          {manageable && <button className="secondary-btn" onClick={() => { setRenameFolder(selectedFolder); setRenameName(selectedFolder.name); }}><Pencil size={16} /> Rename</button>}
          {manageable && <button className="secondary-btn" onClick={() => openShare(selectedFolder)}><Share2 size={16} /> Share</button>}
          {manageable && <button className="folder-danger-btn" onClick={() => setDeleteFolderTarget(selectedFolder)}><Trash2 size={16} /> Delete</button>}
          {editable && <button className="primary-btn" onClick={() => openUpload(selectedFolder)}><UploadCloud size={17} /> Upload files</button>}
        </div>
      </div>

      <div className="folder-security-note"><LockKeyhole size={16} /><span>{access === 'viewer' ? 'View-only folder access. You can preview and download files.' : 'Folder access is inherited by every file inside this folder.'}</span></div>

      {!folderDocs.length ? <div className="folder-empty"><FolderOpen size={46} /><h3>This folder is empty</h3><p>{editable ? 'Upload documents here and share the folder when you are ready.' : 'The folder owner has not added files yet.'}</p>{editable && <button className="primary-btn" onClick={() => openUpload(selectedFolder)}><UploadCloud size={17} /> Upload first file</button>}</div> : <div className="folder-file-table"><table><thead><tr><th>File</th><th>Category</th><th>Security</th><th>Uploaded</th><th>Status</th><th /></tr></thead><tbody>{folderDocs.map((doc) => {
        const Icon = fileIcon(doc.file_name);
        return <tr key={doc.id}><td><div className="doc-cell"><div className="file-icon"><Icon size={20} /></div><div><button className="doc-title-btn" onClick={() => previewDocument(doc)}>{doc.title}</button><span>{doc.docket_number} • {bytes(doc.file_size)}</span></div></div></td><td><span className="category-chip">{doc.category}</span><small>{doc.department}</small></td><td><span className={`security-chip ${String(doc.confidentiality || '').toLowerCase()}`}>{doc.confidentiality}</span></td><td><span>{formatDate(doc.created_at)}</span><small>{doc.uploaded_by === profile.id ? 'You' : 'Shared team file'}</small></td><td><span className={`status-chip ${doc.status}`}>{doc.status}</span></td><td><div className="row-actions"><button title="Preview" onClick={() => previewDocument(doc)}><Eye size={17} /></button><button title="Download" onClick={() => downloadDocument(doc)}><Download size={17} /></button></div></td></tr>;
      })}</tbody></table></div>}

      {uploadOpen && <FolderUploadModal folder={selectedFolder} files={uploadFiles} setFiles={setUploadFiles} form={form} setForm={setForm} role={profile.role} uploading={uploading} inputRef={fileInputRef} onClose={() => !uploading && setUploadOpen(false)} onSubmit={uploadToFolder} />}
      {renameFolder && <RenameModal folder={renameFolder} name={renameName} setName={setRenameName} onClose={() => setRenameFolder(null)} onSubmit={saveRename} />}
      {deleteFolderTarget && <DeleteFolderModal folder={deleteFolderTarget} onClose={() => setDeleteFolderTarget(null)} onConfirm={deleteFolder} />}
      {shareFolder && <ShareModal folder={shareFolder} directory={directory} shareableDirectory={shareableDirectory} shares={folderShareRows} userId={shareUserId} setUserId={setShareUserId} permission={sharePermission} setPermission={setSharePermission} saving={savingShare} onClose={() => setShareFolder(null)} onSubmit={saveShare} onRemove={removeShare} />}
      {preview && <FolderPreview preview={preview} onClose={() => setPreview(null)} onDownload={() => downloadDocument(preview.doc)} />}
    </section>;
  }

  const displayedFolders = trashMode ? deletedFolders : activeFolders;

  return <section className="folder-shell">
    <div className="folder-toolbar folder-root-toolbar">
      <div><p className="eyebrow">{trashMode ? '15-DAY RECOVERY WINDOW' : 'SECURE FOLDER WORKSPACE'}</p><h3>{trashMode ? 'Folder Recycle Bin' : 'Folders'}</h3><p>{trashMode ? 'Deleted folders remain recoverable for 15 days before their files and database records are permanently removed.' : 'Organize files, then share one folder to grant inherited access to everything inside.'}</p></div>
      <div className="folder-root-actions">
        {profile?.role !== 'viewer' && <button className={`secondary-btn ${trashMode ? 'active' : ''}`} onClick={() => setTrashMode((current) => !current)}>{trashMode ? <FolderOpen size={17} /> : <Trash2 size={17} />} {trashMode ? 'Back to folders' : `Folder Recycle Bin${deletedFolders.length ? ` (${deletedFolders.length})` : ''}`}</button>}
        {!trashMode && profile?.role !== 'viewer' && <button className="primary-btn" onClick={() => setCreateOpen(true)}><FolderPlus size={17} /> New folder</button>}
      </div>
    </div>

    {loading ? <div className="folder-empty"><div className="loader" /><p>Loading secure folders…</p></div> : !displayedFolders.length ? <div className="folder-empty">{trashMode ? <Trash2 size={48} /> : <FolderOpen size={48} />}<h3>{trashMode ? 'Folder Recycle Bin is empty' : 'No folders yet'}</h3><p>{trashMode ? 'Deleted folders will appear here for 15 days before permanent deletion.' : profile?.role === 'viewer' ? 'No folder has been shared with this account yet.' : 'Create a folder for a project, department, client, or document group.'}</p>{!trashMode && profile?.role !== 'viewer' && <button className="primary-btn" onClick={() => setCreateOpen(true)}><FolderPlus size={17} /> Create first folder</button>}</div> : <div className="folder-grid">{displayedFolders.map((folder) => {
      const access = accessFor(folder);
      const manageable = canManage(folder);
      const count = folderCount(folder.id);
      return <article className={`folder-card ${trashMode ? 'folder-card-deleted' : ''}`} key={folder.id}>
        {trashMode ? <div className="folder-card-open folder-card-static"><div className="folder-card-icon deleted"><Trash2 size={26} /></div><div className="folder-card-copy"><strong>{folder.name}</strong><span>{count} file{count === 1 ? '' : 's'} • {bytes(folderSize(folder.id))}</span><small className="folder-retention">{retentionSummary(folder.delete_after)}</small></div></div> : <button className="folder-card-open" onClick={() => openFolder(folder)}><div className="folder-card-icon"><FolderOpen size={28} /></div><div className="folder-card-copy"><strong>{folder.name}</strong><span>{count} file{count === 1 ? '' : 's'} • {bytes(folderSize(folder.id))}</span></div></button>}
        <div className="folder-card-bottom">{trashMode ? <><span className="folder-access deleted">Deleted</span>{manageable && <button className="folder-restore-btn" onClick={() => restoreFolder(folder)}><RotateCcw size={15} /> Restore</button>}</> : <><span className={`folder-access ${access}`}>{access === 'owner' ? 'Owner' : access === 'viewer' ? 'Shared • Viewer' : access === 'editor' ? 'Shared • Editor' : `${access} access`}</span>{manageable && <div className="folder-menu-wrap"><button className="folder-dots" onClick={() => setOpenMenu(openMenu === folder.id ? null : folder.id)} aria-label="Folder menu"><MoreVertical size={18} /></button>{openMenu === folder.id && <div className="folder-menu"><button onClick={() => { setRenameFolder(folder); setRenameName(folder.name); setOpenMenu(null); }}><Pencil size={15} /> Rename</button><button onClick={() => openShare(folder)}><Share2 size={15} /> Share folder</button><button className="danger" onClick={() => { setDeleteFolderTarget(folder); setOpenMenu(null); }}><Trash2 size={15} /> Delete folder</button></div>}</div>}</>}</div>
      </article>;
    })}</div>}

    {createOpen && <CreateFolderModal name={createName} setName={setCreateName} onClose={() => { setCreateOpen(false); setCreateName(''); }} onSubmit={createFolder} />}
    {renameFolder && <RenameModal folder={renameFolder} name={renameName} setName={setRenameName} onClose={() => setRenameFolder(null)} onSubmit={saveRename} />}
    {deleteFolderTarget && <DeleteFolderModal folder={deleteFolderTarget} onClose={() => setDeleteFolderTarget(null)} onConfirm={deleteFolder} />}
    {shareFolder && <ShareModal folder={shareFolder} directory={directory} shareableDirectory={shareableDirectory} shares={folderShareRows} userId={shareUserId} setUserId={setShareUserId} permission={sharePermission} setPermission={setSharePermission} saving={savingShare} onClose={() => setShareFolder(null)} onSubmit={saveShare} onRemove={removeShare} />}
  </section>;
}

function CreateFolderModal({ name, setName, onClose, onSubmit }) {
  return <div className="modal-backdrop"><form className="folder-mini-modal" onSubmit={onSubmit}><div className="modal-head"><div><p className="eyebrow">NEW SECURE FOLDER</p><h3>Create folder</h3></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div><label className="folder-field">Folder name<input autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client Contracts 2026" /></label><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={!name.trim()}><FolderPlus size={16} /> Create folder</button></div></form></div>;
}

function RenameModal({ folder, name, setName, onClose, onSubmit }) {
  return <div className="modal-backdrop"><form className="folder-mini-modal" onSubmit={onSubmit}><div className="modal-head"><div><p className="eyebrow">FOLDER SETTINGS</p><h3>Rename folder</h3></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div><label className="folder-field">Folder name<input autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={!name.trim() || name.trim() === folder.name}><Pencil size={16} /> Save name</button></div></form></div>;
}

function DeleteFolderModal({ folder, onClose, onConfirm }) {
  return <div className="modal-backdrop"><section className="folder-mini-modal folder-delete-modal"><div className="modal-head"><div><p className="eyebrow danger-text">FOLDER RECYCLE BIN</p><h3>Delete “{folder.name}”?</h3></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div><div className="folder-delete-copy"><div className="folder-delete-icon"><Trash2 size={24} /></div><div><strong>15-day recovery window</strong><p>The folder and all files inside will disappear from normal access immediately. You can restore it from Folder Recycle Bin for 15 days. After that, the files, docket rows, shares, and folder will be permanently deleted from Supabase.</p></div></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button type="button" className="folder-danger-btn solid" onClick={onConfirm}><Trash2 size={16} /> Move to Recycle Bin</button></div></section></div>;
}

function ShareModal({ folder, directory, shareableDirectory, shares, userId, setUserId, permission, setPermission, saving, onClose, onSubmit, onRemove }) {
  const userMap = new Map(directory.map((item) => [item.id, item]));
  return <div className="modal-backdrop"><section className="folder-share-modal"><div className="modal-head"><div><p className="eyebrow">FOLDER ACCESS</p><h3>Share “{folder.name}”</h3><span className="share-help">Everyone you add gets access to the files already inside and files added later.</span></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div>
    <form className="share-add-row" onSubmit={onSubmit}><label>Team member<select value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Choose a person…</option>{shareableDirectory.map((person) => <option key={person.id} value={person.id}>{person.full_name} • {person.role}{person.email ? ` • ${person.email}` : ''}</option>)}</select></label><label>Access<select value={permission} onChange={(e) => setPermission(e.target.value)}><option value="viewer">Viewer — view & download</option><option value="editor">Editor — view, download & upload</option></select></label><button className="primary-btn" disabled={!userId || saving}><UserPlus size={16} /> {saving ? 'Sharing…' : 'Share'}</button></form>
    <div className="share-list"><div className="share-list-title"><Users size={17} /><strong>People with access</strong><span>{shares.length}</span></div>{!shares.length ? <div className="share-empty">This folder has not been shared with another account yet.</div> : shares.map((row) => { const person = userMap.get(row.user_id); return <article key={row.user_id}><div className="share-avatar">{person?.full_name?.[0] || '?'}</div><div><strong>{person?.full_name || 'Team member'}</strong><span>{person?.email || person?.role || 'Active account'}</span></div><span className="share-permission">{row.permission}</span><button className="share-remove" onClick={() => onRemove(row)}>Remove</button></article>; })}</div>
    <div className="folder-security-note"><LockKeyhole size={15} /><span>Access is enforced by Supabase Row Level Security, not only hidden in the interface.</span></div>
  </section></div>;
}

function FolderUploadModal({ folder, files, setFiles, form, setForm, role, uploading, inputRef, onClose, onSubmit }) {
  const securityOptions = role === 'member' ? ['Internal'] : ['Internal', 'Confidential', 'Restricted'];
  return <div className="modal-backdrop"><form className="upload-modal" onSubmit={onSubmit}><div className="modal-head"><div><p className="eyebrow">UPLOAD TO FOLDER</p><h3>{folder.name}</h3></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div><button type="button" className="drop-zone" onClick={() => inputRef.current?.click()}><UploadCloud size={34} /><strong>Choose files for this folder</strong><span>Multiple files supported • up to 50 MB each</span><input ref={inputRef} type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} /></button>{!!files.length && <div className="selected-files">{files.map((file, index) => { const Icon = fileIcon(file.name); return <div key={`${file.name}-${index}`}><Icon size={18} /><span><strong>{file.name}</strong><small>{bytes(file.size)}</small></span><button type="button" onClick={() => setFiles(files.filter((_, i) => i !== index))}><X size={15} /></button></div>; })}</div>}<div className="form-grid"><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Department<select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>{departments.map((item) => <option key={item}>{item}</option>)}</select></label><label>Security<select value={role === 'member' ? 'Internal' : form.confidentiality} disabled={role === 'member'} onChange={(e) => setForm({ ...form, confidentiality: e.target.value })}>{securityOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label>Document date<input type="date" value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} /></label><label className="wide">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional folder/file notes" /></label></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={!files.length || uploading}>{uploading ? 'Uploading…' : `Upload ${files.length || ''} file${files.length === 1 ? '' : 's'}`}</button></div></form></div>;
}

function FolderPreview({ preview, onClose, onDownload }) {
  const { doc, url, kind } = preview;
  return <div className="modal-backdrop preview-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="preview-modal"><div className="preview-head"><div><p className="eyebrow">SECURE FOLDER PREVIEW</p><h3>{doc.title}</h3><span>{doc.docket_number} • {bytes(doc.file_size)} • {doc.confidentiality}</span></div><div className="preview-actions"><button className="secondary-btn" onClick={onDownload}><Download size={16} /> Download</button><button className="icon-btn" onClick={onClose}><X /></button></div></div><div className="preview-body">{kind === 'image' && <img src={url} alt={doc.title} />}{(kind === 'pdf' || kind === 'text') && <iframe src={url} title={doc.title} />}{kind === 'other' && <div className="preview-fallback"><FileText size={46} /><h4>Browser preview is not available for this file type.</h4><p>You can open the private signed file or download it.</p><div><a className="secondary-btn" href={url} target="_blank" rel="noopener noreferrer">Open file</a><button className="primary-btn" onClick={onDownload}><Download size={16} /> Download</button></div></div>}</div></section></div>;
}
