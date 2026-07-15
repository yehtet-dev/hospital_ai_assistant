import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const supabase = createServiceRoleClient();

  try {
    const { patientId, instructions, followUpDate, signature } = await request.json();

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    // Mark patient completed
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .update({
        status: 'completed',
        doctor_instructions: instructions,
        follow_up_date: followUpDate || null,
        signature,
      })
      .eq('id', patientId)
      .select('*, doctors(name)')
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: patientError?.message || 'Patient not found' }, { status: 404 });
    }

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
