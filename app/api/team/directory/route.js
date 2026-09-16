import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

async function requireActiveUser(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { response: jsonError('Missing authorization token.', 401) };

  const admin = getSupabaseAdmin();
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return { response: jsonError('Invalid or expired session.', 401) };

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, full_name, role, status')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.status !== 'active') {
    return { response: jsonError('Active team access required.', 403) };
  }

  return { admin, user, profile };
}

export async function GET(request) {
  try {
    const guard = await requireActiveUser(request);
    if (guard.response) return guard.response;

    const { admin, user } = guard;
    const [{ data: profiles, error: profilesError }, { data: authData, error: authError }] = await Promise.all([
      admin.from('profiles').select('id, full_name, role, status').eq('status', 'active').order('full_name'),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profilesError) return jsonError(profilesError.message, 500);
    if (authError) return jsonError(authError.message, 500);

    const authUsers = new Map((authData?.users || []).map((item) => [item.id, item]));
    const members = (profiles || [])
      .filter((item) => item.id !== user.id)
      .map((item) => ({
        id: item.id,
        full_name: item.full_name || 'Team Member',
        role: item.role,
        email: authUsers.get(item.id)?.email || '',
      }));

    return Response.json({ members });
  } catch (error) {
    return jsonError(error.message || 'Unable to load team directory.', 500);
  }
}
