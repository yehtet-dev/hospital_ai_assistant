import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DoctorDashboard } from '@/components/DoctorDashboard';

export default async function DoctorPage() {
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

  if (!profile || profile.status !== 'active' || profile.role !== 'doctor') {
    redirect('/login?message=Access denied');
  }

  return (
    <main className="container">
      <DoctorDashboard doctor={profile.doctors} profile={profile} />
    </main>
  );
}
