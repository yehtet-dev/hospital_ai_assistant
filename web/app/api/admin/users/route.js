import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

async function requireAdmin(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
    throw new Error('Admin access required');
  }

  return user;
}

export async function GET(request) {
  try {
    await requireAdmin(request);
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('*, doctors(id, name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ users: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function POST(request) {
  try {
    await requireAdmin(request);
    const supabase = createServiceRoleClient();

    const { email, password, name, role, doctor_id } = await request.json();
    if (!email || !password) throw new Error('Email and password required');

    const { data: user, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) throw createError;

    const updates = {
      full_name: name || '',
      role,
      status: 'active',
      doctor_id: role === 'doctor' ? doctor_id : null,
    };

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.user.id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, user: user.user });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    await requireAdmin(request);
    const supabase = createServiceRoleClient();

    const { id, status, role, doctor_id, reset_password } = await request.json();

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (role !== undefined) {
      updates.role = role;
      updates.doctor_id = role === 'doctor' ? doctor_id : null;
    } else if (doctor_id !== undefined && updates.role !== 'admin') {
      updates.doctor_id = doctor_id;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('profiles').update(updates).eq('id', id);
      if (error) throw error;
    }

    if (reset_password) {
      const { error } = await supabase.auth.admin.updateUserById(id, {
        password: reset_password,
      });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    const supabase = createServiceRoleClient();

    const { id } = await request.json();
    if (!id) throw new Error('User ID required');

    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
