# Smart Clinic Dashboard

This repo now contains two versions:

1. **`web/`** - **Next.js + Supabase** dashboard with login/sign-up and role-based access.
2. **Google Apps Script version** in `Code.gs` + `Index.html` below - a Web App using Google Sheets, with doctor/admin views, signature pad, and full patient data display.

> For the Apps Script demo, copy `Code.gs` and `Index.html` directly into your Apps Script project. The embedded code further down this README may be outdated.

---

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

All of these columns are read and displayed in the dashboard:

`Patient_ID`, `Full_Name`, `Age`, `Sex`, `Phone_Number`, `Address`, `Primary_Symptom`, `Doctor_Name`, `Date`, `Visit_Type`, `Chat_ID`, `Token_Number`, `Status`, `Timestamp`

### `Patients`

All of these columns are read and displayed in the dashboard (add `Signature` at the end if it does not exist):

`Patient_ID`, `Full_Name`, `Age`, `Sex`, `Phone_Number`, `Address`, `Primary_Symptom`, `Doctor_Name`, `Date`, `Visit_Type`, `Chat_ID`, `Token_Number`, `Temperature_Celsius`, `Blood_Pressure_mmHg`, `Heart_Rate_BPM`, `SpO2`, `Status`, `Doctor_Instructions`, `Follow_Up_Date`, `Signature`

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
4. Create a new file named `Code.gs` and paste the contents from the **Code.gs** section below.
5. Create a new file named `Index.html` and paste the contents from the **Index.html** section below.
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

---

## Code.gs

Copy everything below into `Code.gs`:

```javascript
/**
 * Smart Clinic - Role-based Dashboard Web App (Google Apps Script)
 *
 * Serves an HTML dashboard from Google Apps Script. Access is controlled by the
 * user's Google account email:
 *   - Doctors: see only their own scheduled appointments and checked-in patients.
 *   - Admins: see all data and manage Admins/Doctors accounts.
 *
 * Required sheets/tabs (exact column names):
 *   - Appointments: Patient_ID, Full_Name, Token_Number, Doctor_Name, Primary_Symptom,
 *                   Visit_Type, Status, Date
 *   - Patients:     Patient_ID, Full_Name, Token_Number, Doctor_Name, Primary_Symptom,
 *                   Temperature_Celsius, Blood_Pressure_mmHg, Heart_Rate_BPM, SpO2,
 *                   Status, Date, Doctor_Instructions, Follow_Up_Date, Signature
 *   - Live_Queue:   Doctor_Name, Current_Queue_Number, Date
 *   - Doctors:      Doctor_Name, Email, Status, Specialty, Avg_Time, ...
 *   - Admins:       Email, Name, Status   (create manually; first admin is your own email)
 */

function doGet(e) {
  e = e || {};
  e.parameter = e.parameter || {};
  var t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate()
    .setTitle('Smart Clinic Dashboard')
    .setFaviconUrl('https://www.google.com/images/branding/product/ico/googleg_standard_128.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getWebhookUrl() {
  var prop = PropertiesService.getScriptProperties().getProperty('N8N_DOCTOR_WEBHOOK_URL');
  if (prop) return prop;
  return 'YOUR_N8N_DOCTOR_WEBHOOK_URL';
}

function getTodayString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function findColumnIndex(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === name) return i;
  }
  return -1;
}

function formatCell(v) {
  if (v && (v instanceof Date)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

function readSheetRows(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet "' + sheetName + '" not found');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = formatCell(data[i][j]);
    }
    rows.push(row);
  }
  return rows;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeDoctor(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function doctorMatches(rowDoctor, filter) {
  if (!filter) return false;
  var row = normalizeDoctor(rowDoctor);
  var f = normalizeDoctor(filter);
  if (!row || !f) return false;
  var parts = row.split(',').map(function(p) { return p.trim(); }).filter(function(p) { return p; });
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === f) return true;
  }
  return false;
}

function getUserEmail() {
  return normalizeEmail(Session.getActiveUser().getEmail());
}

function getUser() {
  var email = getUserEmail();
  if (!email) return { role: 'none', email: '' };

  // Admins first
  try {
    var admins = readSheetRows('Admins');
    for (var i = 0; i < admins.length; i++) {
      if (normalizeEmail(admins[i].Email) === email) {
        var status = String(admins[i].Status || 'Active').trim().toLowerCase();
        if (status !== 'inactive') {
          return { role: 'admin', email: email, name: String(admins[i].Name || email) };
        }
      }
    }
  } catch (e) { /* Admins sheet may not exist yet */ }

  // Doctors
  var doctors = readSheetRows('Doctors');
  for (var i = 0; i < doctors.length; i++) {
    if (normalizeEmail(doctors[i].Email) === email) {
      var status = String(doctors[i].Status || '').trim().toLowerCase();
      if (status === 'active' || status === '') {
        return {
          role: 'doctor',
          email: email,
          name: String(doctors[i].Doctor_Name || ''),
          doctorName: String(doctors[i].Doctor_Name || '')
        };
      }
    }
  }

  return { role: 'none', email: email };
}

function getActiveDoctors() {
  return readSheetRows('Doctors')
    .filter(function(r) {
      var status = String(r.Status || '').trim().toLowerCase();
      return status === 'active' || status === '';
    })
    .map(function(r) { return String(r.Doctor_Name || ''); })
    .filter(function(n) { return n; })
    .sort();
}

function getAllDoctors() {
  return readSheetRows('Doctors').map(function(r) {
    return {
      Doctor_Name: String(r.Doctor_Name || ''),
      Email: String(r.Email || ''),
      Status: String(r.Status || ''),
      Specialty: String(r.Specialty || '')
    };
  });
}

function getAdmins() {
  try {
    return readSheetRows('Admins');
  } catch (e) {
    return [];
  }
}

function getData(doctorFilter, dateFilter) {
  var user = getUser();
  if (user.role === 'none') throw new Error('Not authorized');

  var today = getTodayString();
  var filter = '';
  var allDoctors = false;
  var filterDate = String(dateFilter || today).trim();

  if (user.role === 'doctor') {
    filter = user.doctorName;
  } else if (user.role === 'admin') {
    filter = String(doctorFilter || '').trim();
    allDoctors = filter === '';
  }

  var appointments = readSheetRows('Appointments').filter(function(r) {
    return String(r.Status || '').trim() === 'Scheduled' &&
           String(r.Date || '').trim() === filterDate &&
           (allDoctors || doctorMatches(r.Doctor_Name, filter));
  }).map(function(r) {
    return {
      Patient_ID: String(r.Patient_ID || ''),
      Full_Name: String(r.Full_Name || ''),
      Token_Number: r.Token_Number != null ? String(r.Token_Number) : '',
      Doctor_Name: String(r.Doctor_Name || ''),
      Primary_Symptom: String(r.Primary_Symptom || ''),
      Visit_Type: String(r.Visit_Type || ''),
      Date: String(r.Date || '')
    };
  }).sort(function(a, b) {
    return (Number(a.Token_Number) || 0) - (Number(b.Token_Number) || 0);
  });

  var checkedIn = readSheetRows('Patients').filter(function(r) {
    return String(r.Status || '').trim() === 'Checked-in' &&
           String(r.Date || '').trim() === filterDate &&
           (allDoctors || doctorMatches(r.Doctor_Name, filter));
  }).map(function(r) {
    return {
      Patient_ID: String(r.Patient_ID || ''),
      Full_Name: String(r.Full_Name || ''),
      Token_Number: r.Token_Number != null ? String(r.Token_Number) : '',
      Doctor_Name: String(r.Doctor_Name || ''),
      Primary_Symptom: String(r.Primary_Symptom || ''),
      Temperature_Celsius: String(r.Temperature_Celsius || ''),
      Blood_Pressure_mmHg: String(r.Blood_Pressure_mmHg || ''),
      Heart_Rate_BPM: String(r.Heart_Rate_BPM || ''),
      SpO2: String(r.SpO2 || ''),
      Doctor_Instructions: String(r.Doctor_Instructions || ''),
      Follow_Up_Date: String(r.Follow_Up_Date || '')
    };
  }).sort(function(a, b) {
    return (Number(a.Token_Number) || 0) - (Number(b.Token_Number) || 0);
  });

  var completed = [];
  if (user.role === 'admin') {
    completed = readSheetRows('Patients').filter(function(r) {
      return String(r.Status || '').trim() === 'Completed' &&
             String(r.Date || '').trim() === filterDate &&
             (allDoctors || doctorMatches(r.Doctor_Name, filter));
    }).map(function(r) {
      return {
        Patient_ID: String(r.Patient_ID || ''),
        Full_Name: String(r.Full_Name || ''),
        Token_Number: r.Token_Number != null ? String(r.Token_Number) : '',
        Doctor_Name: String(r.Doctor_Name || ''),
        Primary_Symptom: String(r.Primary_Symptom || ''),
        Doctor_Instructions: String(r.Doctor_Instructions || ''),
        Follow_Up_Date: String(r.Follow_Up_Date || ''),
        Signature: String(r.Signature || '')
      };
    }).sort(function(a, b) {
      return (Number(a.Token_Number) || 0) - (Number(b.Token_Number) || 0);
    });
  }

  return {
    today: today,
    user: user,
    filterDate: filterDate,
    appointments: appointments,
    checkedIn: checkedIn,
    completed: completed
  };
}

function getPatientRow(patientId) {
  var rows = readSheetRows('Patients').filter(function(r) {
    return String(r.Patient_ID || '').trim() === String(patientId || '').trim();
  });
  return rows.length ? rows[0] : null;
}

function completePatient(patientId, instructions, followUpDate, signature) {
  var user = getUser();
  if (user.role !== 'doctor') throw new Error('Only doctors can complete patients');

  var patient = getPatientRow(patientId);
  if (!patient) throw new Error('Patient not found');
  if (!doctorMatches(patient.Doctor_Name, user.doctorName)) {
    throw new Error('You can only complete your own patients');
  }

  var url = getWebhookUrl();
  var payload = {
    Patient_ID: String(patientId),
    Doctor_Instructions: String(instructions || ''),
    Follow_Up_Date: String(followUpDate || ''),
    Signature: String(signature || '')
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code >= 200 && code < 300) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return { success: true, message: text };
    }
  }

  throw new Error('Webhook error ' + code + ': ' + text);
}

function updateDoctor(doctorName, email, status) {
  var user = getUser();
  if (user.role !== 'admin') throw new Error('Not authorized');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Doctors');
  if (!sheet) throw new Error('Doctors sheet not found');

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var nameIdx = findColumnIndex(headers, 'Doctor_Name');
  var emailIdx = findColumnIndex(headers, 'Email');
  var statusIdx = findColumnIndex(headers, 'Status');
  if (nameIdx < 0) throw new Error('Doctor_Name column not found');

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][nameIdx] || '').trim() === String(doctorName || '').trim()) {
      if (emailIdx >= 0) sheet.getRange(i + 1, emailIdx + 1).setValue(String(email || ''));
      if (statusIdx >= 0) sheet.getRange(i + 1, statusIdx + 1).setValue(String(status || ''));
      return { success: true, doctorName: doctorName, email: email, status: status };
    }
  }
  throw new Error('Doctor not found');
}

function saveAdmin(email, name, status) {
  var user = getUser();
  if (user.role !== 'admin') throw new Error('Not authorized');

  email = normalizeEmail(email);
  if (!email) throw new Error('Email is required');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Admins');
  if (!sheet) {
    sheet = ss.insertSheet('Admins');
    sheet.appendRow(['Email', 'Name', 'Status']);
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === email) {
      sheet.getRange(i + 1, 2).setValue(name || '');
      sheet.getRange(i + 1, 3).setValue(status || 'Active');
      return { success: true, email: email, action: 'updated' };
    }
  }

  sheet.appendRow([email, name || '', status || 'Active']);
  return { success: true, email: email, action: 'added' };
}

function removeAdmin(email) {
  var user = getUser();
  if (user.role !== 'admin') throw new Error('Not authorized');
  if (normalizeEmail(email) === user.email) throw new Error('You cannot remove yourself');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Admins');
  if (!sheet) throw new Error('Admins sheet not found');

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === normalizeEmail(email)) {
      sheet.deleteRow(i + 1);
      return { success: true, email: email };
    }
  }
  throw new Error('Admin not found');
}

```

---

## Index.html

Copy everything below into `Index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Smart Clinic Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 16px; background: #f5f6f8; color: #333; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 12px; }
    .header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .badge { background: #e3f2fd; color: #1565c0; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .toolbar select, .toolbar input, .toolbar button { padding: 8px 12px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; }
    .toolbar select, .toolbar input { min-width: 180px; }
    .toolbar button { background: #2196F3; color: white; border: none; cursor: pointer; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
    @media (min-width: 1000px) { .grid { grid-template-columns: 1fr 1fr; } }
    .card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 16px; }
    .card h2 { margin: 0 0 12px; font-size: 16px; color: #444; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .list { max-height: 60vh; overflow-y: auto; }
    .item { border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #fafafa; }
    .item strong { font-size: 15px; color: #222; }
    .item small { display: block; color: #666; margin-top: 3px; font-size: 12px; }
    .item .meta { margin-top: 6px; font-size: 12px; color: #555; }
    .item button { margin-top: 10px; background: #4CAF50; color: white; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .item button:hover { background: #45a049; }
    .empty { color: #999; font-size: 13px; padding: 10px 0; }
    .form { background: #fff3e0; border: 1px solid #ffe0b2; border-radius: 6px; padding: 14px; margin-top: 12px; }
    .form h3 { margin: 0 0 10px; font-size: 15px; }
    label { display: block; font-size: 13px; margin-bottom: 8px; color: #444; }
    textarea, input[type=date], input[type=text], input[type=email] { width: 100%; padding: 8px; margin-top: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
    .form-actions { margin-top: 12px; }
    .form-actions button { padding: 8px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .form-actions .submit { background: #4CAF50; color: white; }
    .form-actions .cancel { background: #9e9e9e; color: white; margin-left: 8px; }
    #message { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 12px 18px; border-radius: 6px; display: none; font-size: 14px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .loading { color: #666; font-size: 13px; }
    .unauthorized { color: #721c24; background: #f8d7da; padding: 20px; border-radius: 8px; text-align: center; }
    .tabs { display: flex; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid #ddd; }
    .tab { padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; color: #555; }
    .tab.active { border-bottom-color: #2196F3; color: #2196F3; font-weight: 600; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .summary-box { background: white; border-radius: 6px; padding: 12px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-width: 120px; text-align: center; }
    .summary-box .number { font-size: 22px; font-weight: 700; color: #2196F3; }
    .summary-box .label { font-size: 12px; color: #666; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; background: white; border-radius: 6px; overflow: hidden; }
    th, td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .small-btn { background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .danger { background: #f44336; }
    .sig-box { border: 1px dashed #ccc; background: #fff; border-radius: 4px; width: 100%; max-width: 400px; }
    .sig-box canvas { width: 100%; height: 120px; display: block; cursor: crosshair; }
    .sig-actions { margin-top: 8px; }
    .sig-actions button { background: #ff9800; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .hidden { display: none; }
    .section { margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Smart Clinic Dashboard</h1>
      <div class="subtitle" id="subtitle">Loading...</div>
    </div>
    <div id="userInfo"></div>
  </div>

  <div id="message"></div>
  <div id="app"></div>

  <script>
    const $ = (id) => document.getElementById(id);
    let currentUser = null;
    let refreshTimer = null;
    let isSubmitting = false;

    function showMessage(text, isError) {
      const el = $('message');
      el.textContent = text;
      el.className = isError ? 'error' : 'success';
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 6000);
    }

    function setStatus(text) {
      const statusEl = document.querySelector('.loading');
      if (statusEl) statusEl.textContent = text;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function init() {
      $('app').innerHTML = '<p class="loading">Loading user...</p>';
      google.script.run
        .withSuccessHandler(onUser)
        .withFailureHandler(onError)
        .getUser();
    }

    function onError(err) {
      $('app').innerHTML = '<div class="unauthorized">Error: ' + escapeHtml(err.message) + '</div>';
      showMessage(err.message, true);
    }

    function onUser(user) {
      currentUser = user;
      $('subtitle').textContent = 'Today: ' + new Date().toLocaleDateString('en-CA');
      if (user.role === 'none') {
        $('userInfo').innerHTML = '<span class="badge">Not logged in</span>';
        $('app').innerHTML = '<div class="unauthorized">You are not authorized. Your email <strong>' + escapeHtml(user.email) + '</strong> is not in the Doctors or Admins list.</div>';
        return;
      }
      $('userInfo').innerHTML = '<span class="badge">' + escapeHtml(user.role.toUpperCase()) + ': ' + escapeHtml(user.name || user.email) + '</span>';
      if (user.role === 'doctor') renderDoctorView();
      else if (user.role === 'admin') renderAdminView();
    }

    /* ----------------- Doctor View ----------------- */
    function renderDoctorView() {
      $('app').innerHTML = `
        <div class="toolbar">
          <div><span class="loading">Loading...</span></div>
          <button onclick="manualRefresh()">Refresh</button>
        </div>
        <div class="grid">
          <div class="card"><h2>Scheduled Appointments</h2><div id="appointments" class="list"><div class="empty">Loading...</div></div></div>
          <div class="card"><h2>Checked-in Patients</h2><div id="checkedIn" class="list"><div class="empty">Loading...</div></div></div>
        </div>
      `;
      loadDoctorData();
      scheduleRefresh();
    }

    function loadDoctorData() {
      google.script.run
        .withSuccessHandler(renderDoctorData)
        .withFailureHandler(onError)
        .getData('', '');
    }

    function renderDoctorData(data) {
      const statusEl = document.querySelector('.loading');
      if (statusEl) statusEl.textContent = 'Last updated: ' + new Date().toLocaleTimeString();

      const appContainer = $('appointments');
      const checkedContainer = $('checkedIn');
      if (!appContainer || !checkedContainer) return;

      appContainer.innerHTML = data.appointments.length
        ? data.appointments.map(p => `
          <div class="item">
            <strong>${escapeHtml(p.Token_Number ? '#' + p.Token_Number + ' ' : '')}${escapeHtml(p.Full_Name)}</strong>
            <small>Doctor: ${escapeHtml(p.Doctor_Name)}</small>
            <small>Symptom: ${escapeHtml(p.Primary_Symptom)}</small>
            <small>Visit Type: ${escapeHtml(p.Visit_Type)}</small>
          </div>
        `).join('')
        : '<div class="empty">No scheduled appointments for today.</div>';

      window.checkedInPatients = data.checkedIn;
      checkedContainer.innerHTML = data.checkedIn.length
        ? data.checkedIn.map((p, i) => `
          <div class="item" data-idx="${i}">
            <strong>${escapeHtml(p.Token_Number ? '#' + p.Token_Number + ' ' : '')}${escapeHtml(p.Full_Name)}</strong>
            <small>Doctor: ${escapeHtml(p.Doctor_Name)}</small>
            <small>Symptom: ${escapeHtml(p.Primary_Symptom)}</small>
            <div class="meta">Vitals: ${escapeHtml(p.Temperature_Celsius || '-')}, ${escapeHtml(p.Blood_Pressure_mmHg || '-')}, HR ${escapeHtml(p.Heart_Rate_BPM || '-')}, SpO2 ${escapeHtml(p.SpO2 || '-')}</div>
            <button onclick="openCompleteForm(${i})">Complete</button>
          </div>
        `).join('')
        : '<div class="empty">No checked-in patients for today.</div>';
    }

    function openCompleteForm(index) {
      if (isSubmitting) return;
      const p = window.checkedInPatients[index];
      if (!p) return;
      window.currentPatientId = p.Patient_ID;
      const container = $('checkedIn');
      container.innerHTML = `
        <div class="form">
          <h3>Complete ${escapeHtml(p.Full_Name)}</h3>
          <label>Doctor Instructions
            <textarea id="instructions" rows="4" placeholder="Enter instructions">${escapeHtml(p.Doctor_Instructions || '')}</textarea>
          </label>
          <label>Follow-up Date
            <input type="date" id="followUpDate" value="${escapeHtml(p.Follow_Up_Date || '')}">
          </label>
          <label>Doctor Signature
            <div class="sig-box"><canvas id="sigCanvas" width="400" height="120"></canvas></div>
            <div class="sig-actions">
              <button type="button" onclick="clearSignature()">Clear</button>
            </div>
          </label>
          <div class="form-actions">
            <button class="submit" onclick="submitComplete()">Complete &amp; Call Next</button>
            <button class="cancel" onclick="loadDoctorData()">Cancel</button>
          </div>
        </div>
      `;
      initSignaturePad();
    }

    let sigCtx = null;
    let sigDrawing = false;
    function initSignaturePad() {
      const canvas = $('sigCanvas');
      if (!canvas) return;
      sigCtx = canvas.getContext('2d');
      sigCtx.lineWidth = 2;
      sigCtx.lineCap = 'round';
      sigCtx.strokeStyle = '#000';
      sigDrawing = false;

      function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
      }

      canvas.addEventListener('mousedown', (e) => { sigDrawing = true; const pos = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(pos.x, pos.y); });
      canvas.addEventListener('mousemove', (e) => { if (!sigDrawing) return; const pos = getPos(e); sigCtx.lineTo(pos.x, pos.y); sigCtx.stroke(); });
      window.addEventListener('mouseup', () => { sigDrawing = false; });
      canvas.addEventListener('touchstart', (e) => { e.preventDefault(); sigDrawing = true; const pos = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(pos.x, pos.y); });
      canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!sigDrawing) return; const pos = getPos(e); sigCtx.lineTo(pos.x, pos.y); sigCtx.stroke(); });
      window.addEventListener('touchend', () => { sigDrawing = false; });
    }

    function clearSignature() {
      if (!sigCtx) return;
      const canvas = $('sigCanvas');
      sigCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function getSignatureData() {
      const canvas = $('sigCanvas');
      if (!canvas) return '';
      const blank = document.createElement('canvas');
      blank.width = canvas.width;
      blank.height = canvas.height;
      if (canvas.toDataURL() === blank.toDataURL()) return '';
      return canvas.toDataURL('image/png');
    }

    function submitComplete() {
      if (isSubmitting) return;
      const instructions = $('instructions').value;
      const followUpDate = $('followUpDate').value;
      const signature = getSignatureData();
      isSubmitting = true;
      showMessage('Submitting...', false);
      google.script.run
        .withSuccessHandler((result) => {
          isSubmitting = false;
          showMessage(result.message || 'Done', false);
          loadDoctorData();
        })
        .withFailureHandler((err) => {
          isSubmitting = false;
          showMessage('Error: ' + err.message, true);
        })
        .completePatient(window.currentPatientId, instructions, followUpDate, signature);
    }

    /* ----------------- Admin View ----------------- */
    function renderAdminView() {
      $('app').innerHTML = `
        <div class="tabs">
          <button class="tab active" onclick="switchAdminTab('dashboard')">Dashboard</button>
          <button class="tab" onclick="switchAdminTab('doctors')">Doctors</button>
          <button class="tab" onclick="switchAdminTab('admins')">Admins</button>
        </div>
        <div id="adminContent"></div>
      `;
      switchAdminTab('dashboard');
    }

    function switchAdminTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const activeBtn = Array.from(document.querySelectorAll('.tab')).find(b => b.textContent.toLowerCase() === tab);
      if (activeBtn) activeBtn.classList.add('active');

      if (tab === 'dashboard') renderAdminDashboard();
      else if (tab === 'doctors') renderDoctorsManager();
      else if (tab === 'admins') renderAdminsManager();
    }

    function renderAdminDashboard() {
      $('adminContent').innerHTML = `
        <div class="toolbar">
          <div>
            <select id="adminDoctorFilter" onchange="loadAdminDashboardData()"><option value="">All doctors</option></select>
            <input type="date" id="adminDateFilter" value="${new Date().toLocaleDateString('en-CA')}" onchange="loadAdminDashboardData()">
            <span class="loading">Loading...</span>
          </div>
          <button onclick="loadAdminDashboardData()">Refresh</button>
        </div>
        <div class="summary">
          <div class="summary-box"><div class="number" id="countAppointments">0</div><div class="label">Scheduled</div></div>
          <div class="summary-box"><div class="number" id="countCheckedIn">0</div><div class="label">Checked-in</div></div>
          <div class="summary-box"><div class="number" id="countCompleted">0</div><div class="label">Completed</div></div>
        </div>
        <div class="section">
          <h2>Scheduled Appointments</h2>
          <div id="adminAppointments"><div class="empty">Loading...</div></div>
        </div>
        <div class="section">
          <h2>Checked-in Patients</h2>
          <div id="adminCheckedIn"><div class="empty">Loading...</div></div>
        </div>
        <div class="section">
          <h2>Completed Patients</h2>
          <div id="adminCompleted"><div class="empty">Loading...</div></div>
        </div>
      `;
      populateAdminDoctorFilter();
      loadAdminDashboardData();
      scheduleRefreshAdmin();
    }

    function populateAdminDoctorFilter() {
      google.script.run
        .withSuccessHandler((doctors) => {
          const sel = $('adminDoctorFilter');
          if (!sel) return;
          sel.innerHTML = '<option value="">All doctors</option>';
          doctors.forEach(doc => {
            const opt = document.createElement('option');
            opt.value = doc;
            opt.textContent = doc;
            sel.appendChild(opt);
          });
        })
        .withFailureHandler(onError)
        .getActiveDoctors();
    }

    function loadAdminDashboardData() {
      const doctor = $('adminDoctorFilter') ? $('adminDoctorFilter').value : '';
      const date = $('adminDateFilter') ? $('adminDateFilter').value : '';
      google.script.run
        .withSuccessHandler(renderAdminDashboardData)
        .withFailureHandler(onError)
        .getData(doctor, date);
    }

    function renderAdminDashboardData(data) {
      const statusEl = document.querySelector('.loading');
      if (statusEl) statusEl.textContent = 'Last updated: ' + new Date().toLocaleTimeString();

      $('countAppointments').textContent = data.appointments.length;
      $('countCheckedIn').textContent = data.checkedIn.length;
      $('countCompleted').textContent = data.completed.length;

      $('adminAppointments').innerHTML = renderTable(data.appointments, ['Token_Number', 'Full_Name', 'Doctor_Name', 'Primary_Symptom', 'Visit_Type']);
      $('adminCheckedIn').innerHTML = renderTable(data.checkedIn, ['Token_Number', 'Full_Name', 'Doctor_Name', 'Primary_Symptom', 'Temperature_Celsius', 'Blood_Pressure_mmHg', 'Heart_Rate_BPM', 'SpO2']);
      $('adminCompleted').innerHTML = renderTable(data.completed, ['Token_Number', 'Full_Name', 'Doctor_Name', 'Primary_Symptom', 'Doctor_Instructions', 'Follow_Up_Date', 'Signature']);
    }

    function renderTable(rows, columns) {
      if (!rows.length) return '<div class="empty">No records found.</div>';
      let html = '<table><thead><tr>' + columns.map(c => '<th>' + escapeHtml(c) + '</th>').join('') + '</tr></thead><tbody>';
      rows.forEach(r => {
        html += '<tr>' + columns.map(c => {
          const val = r[c];
          if (c === 'Signature' && val) return '<td><a href="' + escapeHtml(val) + '" target="_blank">View</a></td>';
          return '<td>' + escapeHtml(val != null ? val : '') + '</td>';
        }).join('') + '</tr>';
      });
      html += '</tbody></table>';
      return html;
    }

    function renderDoctorsManager() {
      $('adminContent').innerHTML = '<div class="loading">Loading doctors...</div>';
      google.script.run
        .withSuccessHandler((doctors) => {
          $('adminContent').innerHTML = '<h2>Manage Doctors</h2><div id="doctorsTable"></div>';
          const container = $('doctorsTable');
          if (!doctors.length) {
            container.innerHTML = '<div class="empty">No doctors found.</div>';
            return;
          }
          let html = '<table><thead><tr><th>Doctor</th><th>Specialty</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody>';
          doctors.forEach((d, i) => {
            html += `
              <tr>
                <td>${escapeHtml(d.Doctor_Name)}</td>
                <td>${escapeHtml(d.Specialty)}</td>
                <td><input type="email" id="docEmail${i}" value="${escapeHtml(d.Email)}" style="width:200px"></td>
                <td><input type="text" id="docStatus${i}" value="${escapeHtml(d.Status || 'Active')}" style="width:100px"></td>
                <td><button class="small-btn" onclick="saveDoctor(${i})">Save</button></td>
              </tr>
            `;
          });
          html += '</tbody></table>';
          container.innerHTML = html;
          window.doctorsList = doctors;
        })
        .withFailureHandler(onError)
        .getAllDoctors();
    }

    function saveDoctor(index) {
      const doctorName = window.doctorsList[index].Doctor_Name;
      const email = $('docEmail' + index).value;
      const status = $('docStatus' + index).value;
      google.script.run
        .withSuccessHandler(() => { showMessage('Doctor updated', false); renderDoctorsManager(); })
        .withFailureHandler((err) => showMessage(err.message, true))
        .updateDoctor(doctorName, email, status);
    }

    function renderAdminsManager() {
      $('adminContent').innerHTML = '<div class="loading">Loading admins...</div>';
      google.script.run
        .withSuccessHandler((admins) => {
          $('adminContent').innerHTML = `
            <h2>Manage Admins</h2>
            <div style="margin-bottom:16px; background:white; padding:16px; border-radius:6px;">
              <label style="display:inline-block; margin-right:8px;">Email <input type="email" id="newAdminEmail" placeholder="admin@example.com" style="width:220px"></label>
              <label style="display:inline-block; margin-right:8px;">Name <input type="text" id="newAdminName" placeholder="Admin Name" style="width:180px"></label>
              <button class="small-btn" onclick="addAdmin()">Add Admin</button>
            </div>
            <div id="adminsTable"></div>
          `;
          const container = $('adminsTable');
          if (!admins.length) {
            container.innerHTML = '<div class="empty">No admins found.</div>';
            return;
          }
          let html = '<table><thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Action</th></tr></thead><tbody>';
          admins.forEach(a => {
            const email = String(a.Email || '');
            html += `
              <tr>
                <td>${escapeHtml(email)}</td>
                <td>${escapeHtml(a.Name || '')}</td>
                <td>${escapeHtml(a.Status || 'Active')}</td>
                <td><button class="small-btn danger" onclick="removeAdmin('${escapeHtml(email)}')">Remove</button></td>
              </tr>
            `;
          });
          html += '</tbody></table>';
          container.innerHTML = html;
        })
        .withFailureHandler(onError)
        .getAdmins();
    }

    function addAdmin() {
      const email = $('newAdminEmail').value;
      const name = $('newAdminName').value;
      if (!email) return showMessage('Email is required', true);
      google.script.run
        .withSuccessHandler(() => { showMessage('Admin added', false); renderAdminsManager(); })
        .withFailureHandler((err) => showMessage(err.message, true))
        .saveAdmin(email, name, 'Active');
    }

    function removeAdmin(email) {
      if (!confirm('Remove admin ' + email + '?')) return;
      google.script.run
        .withSuccessHandler(() => { showMessage('Admin removed', false); renderAdminsManager(); })
        .withFailureHandler((err) => showMessage(err.message, true))
        .removeAdmin(email);
    }

    /* ----------------- Shared ----------------- */
    function manualRefresh() {
      clearTimeout(refreshTimer);
      if (currentUser.role === 'doctor') loadDoctorData();
      else if (currentUser.role === 'admin') loadAdminDashboardData();
      scheduleRefresh();
    }

    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (currentUser.role === 'doctor') loadDoctorData();
        else if (currentUser.role === 'admin') {
          const activeTab = document.querySelector('.tab.active');
          if (activeTab && activeTab.textContent.toLowerCase() === 'dashboard') loadAdminDashboardData();
        }
        scheduleRefresh();
      }, 30000);
    }

    function scheduleRefreshAdmin() {
      scheduleRefresh();
    }

    window.onload = init;
  </script>
</body>
</html>

```
