'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SignaturePad } from './SignaturePad';

export function DoctorDashboard({ doctor, profile }) {
  const supabase = createClient();
  const today = new Date().toLocaleDateString('en-CA');
  const [date, setDate] = useState(today);
  const [appointments, setAppointments] = useState([]);
  const [checkedIn, setCheckedIn] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [signature, setSignature] = useState('');

  async function loadData() {
    setLoading(true);
    setMessage(null);

    const apptPromise = supabase
      .from('appointments')
      .select('*')
      .eq('doctor_id', doctor.id)
      .eq('date', date)
      .eq('status', 'scheduled')
      .order('token_number', { ascending: true });

    const patientPromise = supabase
      .from('patients')
      .select('*')
      .eq('doctor_id', doctor.id)
      .eq('date', date)
      .eq('status', 'checked-in')
      .order('token_number', { ascending: true });

    const [{ data: apptData, error: apptError }, { data: patientData, error: patientError }] =
      await Promise.all([apptPromise, patientPromise]);

    if (apptError || patientError) {
      setMessage({ text: apptError?.message || patientError?.message, type: 'error' });
    } else {
      setAppointments(apptData || []);
      setCheckedIn(patientData || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, doctor.id]);

  async function handleComplete(patientId) {
    if (!signature) {
      setMessage({ text: 'Please sign before completing', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);

    const res = await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId,
        instructions,
        followUpDate,
        signature,
      }),
    });

    const result = await res.json();
    setLoading(false);

    if (!res.ok || result.error) {
      setMessage({ text: result.error || 'Something went wrong', type: 'error' });
      return;
    }

    setMessage({ text: result.message || 'Patient completed', type: 'success' });
    setCompleting(null);
    setInstructions('');
    setFollowUpDate('');
    setSignature('');
    loadData();
  }

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1>Doctor Dashboard</h1>
          <p className="subtitle" style={{ color: '#666', fontSize: '14px' }}>
            Dr. {doctor.name} &middot; {profile.email}
          </p>
        </div>
        <div className="toolbar">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={loadData} className="secondary">Refresh</button>
          <a href="/api/logout">
            <button className="danger">Log out</button>
          </a>
        </div>
      </div>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="grid two-col">
        <div className="card">
          <h2>Scheduled Appointments</h2>
          <div className="list">
            {appointments.length === 0 && <div className="empty">No scheduled appointments.</div>}
            {appointments.map((p) => (
              <div className="item" key={p.id}>
                <strong>#{p.token_number} {p.full_name}</strong>
                <small>Symptom: {p.primary_symptom || '-'}</small>
                <small>Visit Type: {p.visit_type || '-'}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Checked-in Patients</h2>
          <div className="list">
            {checkedIn.length === 0 && <div className="empty">No checked-in patients.</div>}
            {checkedIn.map((p) => (
              <div className="item" key={p.id}>
                <strong>#{p.token_number} {p.full_name}</strong>
                <small>Symptom: {p.primary_symptom || '-'}</small>
                <div className="meta">
                  Vitals: {p.temperature_celsius || '-'},{' '}
                  {p.blood_pressure_mmhg || '-'},{' '}
                  HR {p.heart_rate_bpm || '-'},{' '}
                  SpO2 {p.sp_o2 || '-'}
                </div>
                {completing === p.id ? (
                  <div className="form" style={{ marginTop: '12px', background: '#fff3e0', padding: '14px', borderRadius: '6px' }}>
                    <h3>Complete {p.full_name}</h3>
                    <div className="form-group">
                      <label>Doctor Instructions</label>
                      <textarea
                        rows="4"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="Enter instructions"
                      />
                    </div>
                    <div className="form-group">
                      <label>Follow-up Date</label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Doctor Signature</label>
                      <SignaturePad onChange={setSignature} />
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <button onClick={() => handleComplete(p.id)} className="success">Complete & Call Next</button>
                      <button onClick={() => setCompleting(null)} className="secondary" style={{ marginLeft: '8px' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setCompleting(p.id)} style={{ marginTop: '10px' }}>
                    Complete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
