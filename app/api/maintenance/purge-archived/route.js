import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
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

    const { data: expired, error: selectError } = await admin
      .from('dockets')
      .select('id, docket_number, file_name, storage_path, delete_after')
      .eq('status', 'archived')
      .not('delete_after', 'is', null)
      .lte('delete_after', now)
      .order('delete_after', { ascending: true })
      .limit(200);

    if (selectError) throw selectError;
    if (!expired?.length) {
      return Response.json({ success: true, purged: 0, checked_at: now });
    }

    const paths = expired.map((doc) => doc.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await admin.storage.from('docket-files').remove(paths);
      if (storageError) throw storageError;
    }

    const ids = expired.map((doc) => doc.id);
    const { error: deleteError } = await admin.from('dockets').delete().in('id', ids);
    if (deleteError) throw deleteError;

    return Response.json({
      success: true,
      purged: ids.length,
      checked_at: now,
      dockets: expired.map((doc) => doc.docket_number),
    });
  } catch (error) {
    console.error('Archived purge failed:', error);
    return Response.json({ error: error.message || 'Archive purge failed.' }, { status: 500 });
  }
}
