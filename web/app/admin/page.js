import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminDashboard } from '@/components/AdminDashboard';

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, doctors(id, name)')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'active' || profile.role !== 'admin') {
    redirect('/login?message=Admin access required');
  }

  const { data: doctors } = await supabase
    .from('doctors')
    .select('id, name, specialty, email, status')
    .order('name');

  return (
    <main className="container">
      <AdminDashboard user={user} doctors={doctors || []} />
    </main>
  );
}
