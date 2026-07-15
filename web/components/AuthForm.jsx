'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function AuthForm({ mode }) {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('doctor');
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (mode === 'signup') {
      supabase
        .from('doctors')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
        .then(({ data, error }) => {
          if (!error && data) setDoctors(data);
        });
    }
  }, [mode, supabase]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage({ text: error.message, type: 'error' });
      return;
    }

    // Redirect will be handled by server on next navigation
    window.location.href = '/';
  }

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setLoading(false);
      setMessage({ text: error.message, type: 'error' });
      return;
    }

    if (data?.user) {
      const updates = {
        full_name: fullName,
        role,
        status: 'pending',
      };
      if (role === 'doctor' && doctorId) {
        updates.doctor_id = doctorId;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', data.user.id);

      if (profileError) {
        setLoading(false);
        setMessage({ text: profileError.message, type: 'error' });
        return;
      }
    }

    setLoading(false);
    setMessage({
      text: 'Account created. If email confirmation is enabled, check your inbox. Otherwise, wait for admin approval.',
      type: 'success',
    });
  }

  return (
    <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {mode === 'signup' && (
        <div className="form-group">
          <label htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
      )}

      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
      </div>

      {mode === 'signup' && (
        <>
          <div className="form-group">
            <label htmlFor="role">Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {role === 'doctor' && (
            <div className="form-group">
              <label htmlFor="doctor">Select Doctor</label>
              <select
                id="doctor"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                required={role === 'doctor'}
              >
                <option value="">-- Select doctor --</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <button type="submit" disabled={loading}>
        {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
      </button>
    </form>
  );
}
