# Smart Clinic Dashboard (Next.js + Supabase)

A role-based web dashboard for Smart Clinic built with **Next.js 14 (App Router)** and **Supabase**.

- **Login / Sign-up**: email/password with Supabase Auth.
- **Doctor dashboard**: view scheduled appointments and checked-in patients, complete consultations with instructions, follow-up dates, and digital signatures.
- **Admin dashboard**: manage users (approve, activate, delete, reset passwords), filter all appointments/patients by doctor and date, view doctor list.

---

## Setup

### 1. Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and create a project.
2. In **Project Settings > API**, copy:
   - `URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (keep secret) → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Run the database schema

In your Supabase project, open the **SQL Editor** and run the contents of [`../supabase/schema.sql`](../supabase/schema.sql).

Make sure:

- **Auth Settings > Email**:
  - Disable **Confirm email** if you want users to log in immediately after sign-up.
  - Or leave it enabled and set **Site URL** and **Redirect URLs** to your deployed URL (e.g. `https://your-app.vercel.app/auth/callback`).
- The `handle_new_user` trigger creates a `pending` `doctor` profile for every new signup.

### 3. Add doctors

Insert doctors into the `doctors` table (or disable RLS temporarily to seed):

```sql
insert into public.doctors (name, specialty, email, status)
values
  ('Dr. Grace Wilson', 'Family Medicine', 'grace@clinic.com', 'active'),
  ('Dr. Michael Johnson', 'Orthopedics', 'michael@clinic.com', 'active');
```

### 4. Configure the app

Copy the example environment file:

```bash
cp .env.example .env.local
```

Fill in your Supabase credentials.

### 5. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. First admin user

The very first user who signs up on the **Sign up** page becomes an **admin** automatically (because the `Users` table is empty). After that, new sign-ups are `pending` until an admin activates them.

---

## Deployment

Deploy to Vercel, Fly.io, or any Next.js host. Set the same environment variables.

Make sure the **Supabase Auth redirect URL** includes `/auth/callback` on your deployed domain.

---

## Migrating from Google Sheets

If you are moving from the Google Sheets / n8n setup:

1. Replace `createServiceRoleClient()` calls in `lib/supabase/service-role.js` with your own Supabase client.
2. Update the n8n workflows to read/write Supabase tables instead of Google Sheets, or call the same Next.js API routes.
3. The `Patients`, `Appointments`, `Doctors`, and `Queues` tables in Supabase replace the corresponding Google Sheets tabs.
