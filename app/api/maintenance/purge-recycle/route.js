import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

async function removeStoragePaths(admin, paths) {
  const unique = [...new Set((paths || []).filter(Boolean))];
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);
    const { error } = await admin.storage.from('docket-files').remove(batch);
    if (error) throw error;
  }
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return unauthorized();
  }

  try {
    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();

    let purgedFolders = 0;
    let purgedFolderDockets = 0;

    const { data: expiredFolders, error: folderSelectError } = await admin
      .from('folders')
      .select('id,name,delete_after')
      .eq('status', 'deleted')
      .not('delete_after', 'is', null)
      .lte('delete_after', now)
      .order('delete_after', { ascending: true })
      .limit(25);

    if (folderSelectError) throw folderSelectError;

    for (const folder of expiredFolders || []) {
      const { data: folderDocs, error: folderDocsError } = await admin
        .from('dockets')
        .select('id,storage_path')
        .eq('folder_id', folder.id);

      if (folderDocsError) throw folderDocsError;

      await removeStoragePaths(admin, (folderDocs || []).map((doc) => doc.storage_path));

      const docketIds = (folderDocs || []).map((doc) => doc.id);
      if (docketIds.length) {
        const { error: docketDeleteError } = await admin.from('dockets').delete().in('id', docketIds);
        if (docketDeleteError) throw docketDeleteError;
        purgedFolderDockets += docketIds.length;
      }

      const { error: folderDeleteError } = await admin.from('folders').delete().eq('id', folder.id);
      if (folderDeleteError) throw folderDeleteError;
      purgedFolders += 1;
    }

    const { data: expired, error: selectError } = await admin
      .from('dockets')
      .select('id, docket_number, file_name, storage_path, delete_after')
      .eq('status', 'deleted')
      .not('delete_after', 'is', null)
      .lte('delete_after', now)
      .order('delete_after', { ascending: true })
      .limit(200);

    if (selectError) throw selectError;

    const paths = (expired || []).map((doc) => doc.storage_path).filter(Boolean);
    await removeStoragePaths(admin, paths);

    const ids = (expired || []).map((doc) => doc.id);
    if (ids.length) {
      const { error: deleteError } = await admin.from('dockets').delete().in('id', ids);
      if (deleteError) throw deleteError;
    }

    return Response.json({
      success: true,
      checked_at: now,
      purged_dockets: ids.length,
      purged_folders: purgedFolders,
      purged_folder_dockets: purgedFolderDockets,
      dockets: (expired || []).map((doc) => doc.docket_number),
    });
  } catch (error) {
    console.error('Recycle Bin purge failed:', error);
    return Response.json({ error: error.message || 'Recycle Bin purge failed.' }, { status: 500 });
  }
}
