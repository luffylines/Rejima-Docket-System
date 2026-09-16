import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

const ALLOWED_ROLES = new Set(['admin', 'manager', 'member', 'viewer']);
const ALLOWED_STATUSES = new Set(['active', 'disabled']);

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function requireAdmin(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) return { response: jsonError('Missing authorization token.', 401) };

  const admin = getSupabaseAdmin();
  const { data: { user }, error: userError } = await admin.auth.getUser(token);

  if (userError || !user) {
    return { response: jsonError('Invalid or expired session.', 401) };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, full_name, role, status')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.status !== 'active' || profile.role !== 'admin') {
    return { response: jsonError('Administrator access required.', 403) };
  }

  return { admin, user, profile };
}

async function writeAudit(admin, actorId, action, detail) {
  const { error } = await admin.from('audit_logs').insert({
    action,
    docket_id: null,
    detail,
    actor_id: actorId,
  });

  if (error) console.error('Unable to append team audit log:', error.message);
}

export async function GET(request) {
  try {
    const guard = await requireAdmin(request);
    if (guard.response) return guard.response;

    const { admin } = guard;
    const [{ data: profileRows, error: profilesError }, { data: authData, error: usersError }] = await Promise.all([
      admin.from('profiles').select('id, full_name, role, status, created_at, updated_at').order('created_at', { ascending: true }),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profilesError) return jsonError(profilesError.message, 500);
    if (usersError) return jsonError(usersError.message, 500);

    const authUsers = new Map((authData?.users || []).map((user) => [user.id, user]));
    const members = (profileRows || []).map((profile) => {
      const authUser = authUsers.get(profile.id);
      return {
        ...profile,
        email: authUser?.email || '',
        last_sign_in_at: authUser?.last_sign_in_at || null,
        email_confirmed_at: authUser?.email_confirmed_at || null,
      };
    });

    return NextResponse.json({ members });
  } catch (error) {
    return jsonError(error.message || 'Unable to load team members.', 500);
  }
}

export async function POST(request) {
  try {
    const guard = await requireAdmin(request);
    if (guard.response) return guard.response;

    const { admin, user: actor } = guard;
    const body = await request.json();
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = String(body.role || 'member').toLowerCase();

    if (!fullName) return jsonError('Full name is required.');
    if (!email || !email.includes('@')) return jsonError('A valid email is required.');
    if (password.length < 8) return jsonError('Password must be at least 8 characters.');
    if (!ALLOWED_ROLES.has(role)) return jsonError('Invalid role.');

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created?.user) {
      return jsonError(createError?.message || 'Unable to create account.');
    }

    const { error: profileError } = await admin.from('profiles').upsert({
      id: created.user.id,
      full_name: fullName,
      role,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (profileError) return jsonError(profileError.message, 500);

    await writeAudit(admin, actor.id, 'created team account', `${fullName} (${email}) • ${role}`);

    return NextResponse.json({
      member: {
        id: created.user.id,
        full_name: fullName,
        email,
        role,
        status: 'active',
        created_at: created.user.created_at,
        last_sign_in_at: null,
      },
    }, { status: 201 });
  } catch (error) {
    return jsonError(error.message || 'Unable to create account.', 500);
  }
}

export async function PATCH(request) {
  try {
    const guard = await requireAdmin(request);
    if (guard.response) return guard.response;

    const { admin, user: actor } = guard;
    const body = await request.json();
    const userId = String(body.userId || '').trim();
    const role = body.role ? String(body.role).toLowerCase() : null;
    const status = body.status ? String(body.status).toLowerCase() : null;

    if (!userId) return jsonError('User ID is required.');
    if (role && !ALLOWED_ROLES.has(role)) return jsonError('Invalid role.');
    if (status && !ALLOWED_STATUSES.has(status)) return jsonError('Invalid status.');

    if (userId === actor.id && ((role && role !== 'admin') || status === 'disabled')) {
      return jsonError('You cannot remove your own administrator access or disable your own account.', 409);
    }

    const patch = { updated_at: new Date().toISOString() };
    if (role) patch.role = role;
    if (status) patch.status = status;

    const { data: updated, error: updateError } = await admin
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id, full_name, role, status, created_at, updated_at')
      .single();

    if (updateError) return jsonError(updateError.message, 500);

    const changes = [role ? `role=${role}` : null, status ? `status=${status}` : null].filter(Boolean).join(', ');
    await writeAudit(admin, actor.id, 'updated team account', `${updated.full_name || userId} • ${changes}`);

    return NextResponse.json({ member: updated });
  } catch (error) {
    return jsonError(error.message || 'Unable to update account.', 500);
  }
}
