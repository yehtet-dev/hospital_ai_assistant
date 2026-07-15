import { AuthForm } from '@/components/AuthForm';

export default function SignupPage() {
  return (
    <div className="container" style={{ maxWidth: '400px', paddingTop: '60px' }}>
      <div className="card">
        <h1>Smart Clinic</h1>
        <p style={{ color: '#666', marginBottom: '20px' }}>Create a new account</p>
        <AuthForm mode="signup" />
        <p style={{ marginTop: '16px', fontSize: '13px' }}>
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </div>
  );
}
