# Smart Clinic - Role-based Dashboard (Google Apps Script)

A single Google Apps Script Web App that serves role-based dashboards for your Smart Clinic:

- **Doctor dashboard**: see only your own scheduled appointments and checked-in patients, add follow-up dates, doctor instructions, and a digital signature.
- **Admin dashboard**: see all appointments/patients, manage doctor emails/status, and manage admin accounts.

The app uses the user's Google account email for login. Access is controlled by matching the email against the `Doctors` and `Admins` sheets.

> Note: This version keeps Google Sheets as the database. The layout is designed so the data layer can later be swapped for Supabase.

---

## Files

| File | Purpose |
|------|---------|
| `Code.gs` | Google Apps Script server code (role detection, data API, completion webhook). |
| `Index.html` | Web app UI (doctor + admin views, signature pad, admin management). |
| `03 - Doctor Dashboard (Google Sheets Web App) v3.json` | n8n workflow for `doctor-submit` webhook (now stores `Signature` too). |

---

## Required Google Sheets tabs

Make sure your spreadsheet has these tabs with these exact column headers.

### `Appointments`

`Patient_ID`, `Full_Name`, `Token_Number`, `Doctor_Name`, `Primary_Symptom`, `Visit_Type`, `Status`, `Date`

### `Patients`

Add a new `Signature` column at the end if it does not exist:

`Patient_ID`, `Full_Name`, `Token_Number`, `Doctor_Name`, `Primary_Symptom`, `Temperature_Celsius`, `Blood_Pressure_mmHg`, `Heart_Rate_BPM`, `SpO2`, `Status`, `Date`, `Doctor_Instructions`, `Follow_Up_Date`, `Signature`

### `Live_Queue`

`Doctor_Name`, `Current_Queue_Number`, `Date`

### `Doctors`

Must include `Doctor_Name`, `Email`, `Status`, and your other doctor columns (Specialty, Avg_Time, etc.).

### `Admins`

Create this tab manually and add the first admin (your own email):

| Email | Name | Status |
|-------|------|--------|
| your-email@example.com | Super Admin | Active |

`Status` can be `Active` or `Inactive`.

---

## n8n setup

1. Import `03 - Doctor Dashboard (Google Sheets Web App) v3.json` into n8n.
2. Connect your Google Sheets and Telegram credentials.
3. Activate the workflow.
4. Copy the production webhook URL of the `Doctor Submit Webhook` node (path: `doctor-submit`).

---

## Apps Script setup

1. Open your Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Delete the default `Code.gs` file.
4. Create a new file named `Code.gs` and paste the contents of `Code.gs`.
5. Create a new file named `Index.html` and paste the contents of `Index.html`.
6. Set the n8n webhook URL:
   - Click the **gear icon** (Project Settings).
   - Under **Script properties**, click **Add script property**.
   - Property: `N8N_DOCTOR_WEBHOOK_URL`
   - Value: your `https://.../webhook/doctor-submit` URL.
7. Add a `Signature` column to the `Patients` sheet if it does not exist.
8. Create the `Admins` sheet and add your email with `Status = Active`.

## Deploy the Web App

1. In Apps Script, click **Deploy > New deployment**.
2. Click the **settings icon** and choose **Web app**.
3. Configure:
   - **Description**: `Smart Clinic Dashboard`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (or `Anyone within your domain`)
4. Click **Deploy** and authorize.
5. Copy the **Web App URL**.

> For the dashboard to know who is logged in, choose **Anyone** (not *Anyone, even anonymous*). If you choose a Workspace domain, only users in that domain can open it.

---

## How it works

- The web app calls `getUser()` to read the active Google account email.
- It checks `Admins` first, then `Doctors`.
- If the email matches an active doctor, the user sees the doctor dashboard.
- If the email matches an active admin, the user sees the admin dashboard.
- Doctors can complete a checked-in patient: the form sends `Patient_ID`, `Doctor_Instructions`, `Follow_Up_Date`, and a base64 PNG `Signature` to the n8n `doctor-submit` webhook. n8n updates the `Patients` sheet, advances the live queue, and sends the next patient a Telegram message.
- Admins can filter the dashboard by doctor and date, and manage doctor/admin accounts.

---

## Direct doctor link

You can give each doctor a direct link by appending their name to the Web App URL:

```
https://script.google.com/.../exec?doctor=Dr+Grace+Wilson
```

If the user's email is mapped in the `Doctors` sheet, they will see their own data automatically.

---

## Migrating to Supabase later

The UI and server functions are separated so that later you can:

1. Replace `readSheetRows()` with Supabase client calls.
2. Replace `getUser()` with Supabase Auth + `profiles` role table.
3. Keep `Index.html` mostly unchanged; update the `google.script.run` calls to your own API endpoints.
