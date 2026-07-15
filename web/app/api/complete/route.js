import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const authSupabase = createClient();
  const { data: { user } } = await authSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await authSupabase
    .from('profiles')
    .select('role, doctor_id, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Account not active' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();

  try {
    const { patientId, instructions, followUpDate, signature } = await request.json();

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    // Fetch the patient first to check ownership
    const { data: patient, error: findError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (findError || !patient) {
      return NextResponse.json({ error: findError?.message || 'Patient not found' }, { status: 404 });
    }

    if (profile.role === 'doctor' && patient.doctor_id !== profile.doctor_id) {
      return NextResponse.json({ error: 'You can only complete your own patients' }, { status: 403 });
    }

    if (profile.role !== 'doctor' && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Mark patient completed
    const { error: updateError } = await supabase
      .from('patients')
      .update({
        status: 'completed',
        doctor_instructions: instructions,
        follow_up_date: followUpDate || null,
        signature,
      })
      .eq('id', patientId);

    if (updateError) throw updateError;

    // Advance queue
    await supabase
      .from('queues')
      .upsert({
        doctor_id: patient.doctor_id,
        date: patient.date,
        current_number: (patient.token_number || 0) + 1,
      });

    // Find next patient
    const { data: nextPatient } = await supabase
      .from('patients')
      .select('*')
      .eq('doctor_id', patient.doctor_id)
      .eq('date', patient.date)
      .eq('status', 'checked-in')
      .gte('token_number', (patient.token_number || 0) + 1)
      .order('token_number', { ascending: true })
      .limit(1)
      .single();

    let message = `Completed ${patient.full_name}.`;
    if (nextPatient) {
      message += ` Next: ${nextPatient.full_name} (#${nextPatient.token_number}).`;
    } else {
      message += ' No more checked-in patients.';
    }

    return NextResponse.json({ success: true, message, nextPatient });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
