import { AuthForm } from '@/components/AuthForm';

export default function LoginPage({ searchParams }) {
  return (
    <div className="container" style={{ maxWidth: '400px', paddingTop: '60px' }}>
      <div className="card">
        <h1>Smart Clinic</h1>
        <p style={{ color: '#666', marginBottom: '20px' }}>Log in to your dashboard</p>
        <AuthForm mode="login" />
        {searchParams?.message && (
          <div className="message error" style={{ marginTop: '16px' }}>
            {searchParams.message}
          </div>
        )}
        <p style={{ marginTop: '16px', fontSize: '13px' }}>
          Don&apos;t have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </div>
  );
}
