-- Smart Clinic Supabase schema
-- Run this in the Supabase SQL Editor.

-- 1. Doctors (must exist before profiles/appointments/patients/queues reference it)
create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  specialty text,
  email text,
  available_days text[],
  available_time text,
  avg_time integer default 15,
  max_patients_per_day integer default 20,
  status text default 'active',
  created_at timestamptz default now()
);

-- 2. Profiles: one row per authenticated user, linked to auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null check (role in ('admin', 'doctor')),
  doctor_id uuid references public.doctors(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  created_at timestamptz default now()
);

-- 3. Appointments (kept in sync from n8n/registration)
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  full_name text not null,
  token_number integer,
  doctor_id uuid references public.doctors(id),
  primary_symptom text,
  visit_type text,
  status text default 'scheduled',
  date date not null,
  chat_id text,
  created_at timestamptz default now()
);

-- 4. Patients / checked-in queue
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  full_name text not null,
  token_number integer,
  doctor_id uuid references public.doctors(id),
  primary_symptom text,
  temperature_celsius text,
  blood_pressure_mmhg text,
  heart_rate_bpm text,
  sp_o2 text,
  status text default 'checked-in',
  date date not null,
  doctor_instructions text,
  follow_up_date date,
  signature text,
  created_at timestamptz default now()
);

-- 5. Live queue per doctor per day
create table if not exists public.queues (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id),
  date date not null,
  current_number integer default 0,
  unique (doctor_id, date)
);

-- Row Level Security (basic)
alter table public.profiles enable row level security;
alter table public.doctors enable row level security;
alter table public.appointments enable row level security;
alter table public.patients enable row level security;
alter table public.queues enable row level security;

-- Allow anon read on doctors (used by booking AI to list roster)
create policy "Doctors are readable by everyone"
  on public.doctors
  for select
  to anon, authenticated
  using (true);

-- Profiles: users can read/update own profile; admins can read/update all
create policy "Users read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins manage profiles"
  on public.profiles
  for all
  to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active'
  ))
  with check (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active'
  ));

-- Doctors can see own appointments/patients; admins see all
create policy "Appointments doctor/admin access"
  on public.appointments
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
    or doctor_id = (select doctor_id from public.profiles where id = auth.uid() and role = 'doctor' and status = 'active')
  );

create policy "Patients doctor/admin access"
  on public.patients
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
    or doctor_id = (select doctor_id from public.profiles where id = auth.uid() and role = 'doctor' and status = 'active')
  );

create policy "Queues doctor/admin access"
  on public.queues
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
    or doctor_id = (select doctor_id from public.profiles where id = auth.uid() and role = 'doctor' and status = 'active')
  );

-- Function to create profile on user signup (trigger)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, 'doctor', 'pending');
  return new;
end;
$$;

-- Trigger runs after a new auth.users row is inserted
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
