'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function AdminDashboard({ user, doctors }) {
  const supabase = createClient();
  const today = new Date().toLocaleDateString('en-CA');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [date, setDate] = useState(today);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [checkedIn, setCheckedIn] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    name: '',
    role: 'doctor',
    doctor_id: '',
  });

  async function loadDashboardData() {
    setLoading(true);
    let apptQuery = supabase
      .from('appointments')
      .select('*')
      .eq('date', date)
      .eq('status', 'scheduled')
      .order('token_number', { ascending: true });

    let patientQuery = supabase
      .from('patients')
      .select('*')
      .eq('date', date)
      .order('token_number', { ascending: true });

    if (doctorFilter) {
      apptQuery = apptQuery.eq('doctor_id', doctorFilter);
      patientQuery = patientQuery.eq('doctor_id', doctorFilter);
    }

    const [{ data: apptData }, { data: patientData }] = await Promise.all([
      apptQuery,
      patientQuery,
    ]);

    const allPatients = patientData || [];
    setAppointments(apptData || []);
    setCheckedIn(allPatients.filter((p) => p.status === 'checked-in'));
    setCompleted(allPatients.filter((p) => p.status === 'completed'));
    setLoading(false);
  }

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (data.users) setUsers(data.users);
  }

  useEffect(() => {
    if (activeTab === 'dashboard') loadDashboardData();
    if (activeTab === 'users') loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, date, doctorFilter]);

  async function createUser(e) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: 'error' });
      return;
    }
    setMessage({ text: 'User created', type: 'success' });
    setNewUser({ email: '', password: '', name: '', role: 'doctor', doctor_id: '' });
    loadUsers();
  }

  async function updateUser(id, changes) {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...changes }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: 'error' });
      return;
    }
    setMessage({ text: 'User updated', type: 'success' });
    loadUsers();
  }

  async function deleteUser(id) {
    if (!confirm('Delete this user?')) return;
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: 'error' });
      return;
    }
    setMessage({ text: 'User deleted', type: 'success' });
    loadUsers();
  }

  function renderTable(rows, columns) {
    if (!rows.length) return <div className="empty">No records found.</div>;
    return (
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => {
                const val = row[col];
                if (col === 'signature' && val) {
                  return (
                    <td key={col}>
                      <a href={val} target="_blank" rel="noreferrer">
                        View
                      </a>
                    </td>
                  );
                }
                return <td key={col}>{val != null ? val : '-'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1>Admin Dashboard</h1>
          <p className="subtitle" style={{ color: '#666', fontSize: '14px' }}>
            {user.email}
          </p>
        </div>
        <a href="/api/logout">
          <button className="danger">Log out</button>
        </a>
      </div>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="tabs">
        <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          Dashboard
        </button>
        <button className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          Users
        </button>
        <button className={`tab ${activeTab === 'doctors' ? 'active' : ''}`} onClick={() => setActiveTab('doctors')}>
          Doctors
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          <div className="toolbar">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
              <option value="">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button onClick={loadDashboardData} className="secondary">
              Refresh
            </button>
          </div>

          <div className="summary">
            <div className="summary-box">
              <div className="number">{appointments.length}</div>
              <div className="label">Scheduled</div>
            </div>
            <div className="summary-box">
              <div className="number">{checkedIn.length}</div>
              <div className="label">Checked-in</div>
            </div>
            <div className="summary-box">
              <div className="number">{completed.length}</div>
              <div className="label">Completed</div>
            </div>
          </div>

          <div className="card">
            <h2>Scheduled Appointments</h2>
            {renderTable(appointments, ['token_number', 'full_name', 'doctor_id', 'primary_symptom', 'visit_type'])}
          </div>

          <div className="card">
            <h2>Checked-in Patients</h2>
            {renderTable(checkedIn, [
              'token_number',
              'full_name',
              'doctor_id',
              'primary_symptom',
              'temperature_celsius',
              'blood_pressure_mmhg',
              'heart_rate_bpm',
              'sp_o2',
            ])}
          </div>

          <div className="card">
            <h2>Completed Patients</h2>
            {renderTable(completed, [
              'token_number',
              'full_name',
              'doctor_id',
              'primary_symptom',
              'doctor_instructions',
              'follow_up_date',
              'signature',
            ])}
          </div>
        </>
      )}

      {activeTab === 'users' && (
        <>
          <div className="card">
            <h2>Create User</h2>
            <form onSubmit={createUser}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  minLength={6}
                  required
                />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="doctor">Doctor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {newUser.role === 'doctor' && (
                <div className="form-group">
                  <label>Doctor</label>
                  <select
                    value={newUser.doctor_id}
                    onChange={(e) => setNewUser({ ...newUser, doctor_id: e.target.value })}
                    required={newUser.role === 'doctor'}
                  >
                    <option value="">-- Select doctor --</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button type="submit">Create User</button>
            </form>
          </div>

          <div className="card">
            <h2>All Users</h2>
            {users.length === 0 && <div className="empty">No users found.</div>}
            {users.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Doctor</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{u.full_name}</td>
                      <td>{u.role}</td>
                      <td>{u.doctors?.name || '-'}</td>
                      <td>{u.status}</td>
                      <td>
                        {u.status === 'pending' && (
                          <button onClick={() => updateUser(u.id, { status: 'active' })} className="success">
                            Approve
                          </button>
                        )}
                        {u.status === 'active' && (
                          <button onClick={() => updateUser(u.id, { status: 'inactive' })} className="secondary">
                            Deactivate
                          </button>
                        )}
                        {u.status === 'inactive' && (
                          <button onClick={() => updateUser(u.id, { status: 'active' })} className="success">
                            Activate
                          </button>
                        )}
                        <button onClick={() => deleteUser(u.id)} className="danger" style={{ marginLeft: '6px' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'doctors' && (
        <div className="card">
          <h2>Doctors</h2>
          {doctors.length === 0 && <div className="empty">No doctors found.</div>}
          {doctors.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Specialty</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.specialty}</td>
                    <td>{d.email}</td>
                    <td>{d.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
