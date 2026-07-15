# Smart Clinic - Doctor Dashboard Web App (Apps Script)

A single Google Apps Script Web App that displays all data for today's scheduled appointments and checked-in patients, filtered by doctor. The doctor can complete a checked-in patient (enter doctor instructions, follow-up date), and the data is sent to an n8n `doctor-submit` webhook.

## Files

1. `Code.gs` - Google Apps Script server code.
2. `Index.html` - Web app HTML/JS UI.

## Required Google Sheets tabs

### `Appointments`

`Patient_ID`, `Full_Name`, `Age`, `Sex`, `Phone_Number`, `Address`, `Primary_Symptom`, `Doctor_Name`, `Date`, `Visit_Type`, `Chat_ID`, `Token_Number`, `Status`, `Timestamp`

### `Patients`

`Patient_ID`, `Full_Name`, `Age`, `Sex`, `Phone_Number`, `Address`, `Primary_Symptom`, `Doctor_Name`, `Date`, `Visit_Type`, `Chat_ID`, `Token_Number`, `Temperature_Celsius`, `Blood_Pressure_mmHg`, `Heart_Rate_BPM`, `SpO2`, `Status`, `Doctor_Instructions`, `Follow_Up_Date`, `Signature`

### `Doctors`

`Doctor_Name`, `Status` (`Active`/`Inactive`), plus any other doctor columns.

### `Live_Queue`

`Doctor_Name`, `Current_Queue_Number`, `Date`

> `Date` columns should be `yyyy-MM-dd` format or actual date cells. `Status` values are case-sensitive: `Scheduled`, `Checked-in`, `Completed`.

## Setup

1. Open your Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Delete the default `Code.gs`.
4. Create a file named `Code.gs` and paste the `Code.gs` section below.
5. Create a file named `Index` (it will show as `Index.html`) and paste the `Index.html` section below.
6. Set the n8n webhook URL:
   - Project Settings (gear icon) > Script properties.
   - Add `N8N_WEBHOOK_URL` with your `doctor-submit` webhook URL.
   - Or replace `YOUR_N8N_WEBHOOK_URL` in `Code.gs`.
7. Save.
8. **Deploy > New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or your domain)
   - Click **Deploy** and authorize.
9. Share the Web App URL with doctors.
10. Open the URL, select a doctor from the dropdown, and the dashboard will show all data.

---

## Code.gs

```javascript
/**
 * Smart Clinic - Doctor Dashboard Web App
 * 
 * Serves an HTML dashboard from Google Apps Script. Lists today's scheduled
 * appointments and checked-in patients from the linked Google Sheet, filtered
 * by doctor. When the doctor completes a checked-in patient, the data is sent
 * to the n8n "doctor-submit" webhook, which updates the Patients sheet and
 * advances the live queue.
 */

function doGet(e) {
  e = e || {};
  e.parameter = e.parameter || {};
  var t = HtmlService.createTemplateFromFile('Index');
  t.doctor = e.parameter.doctor || '';
  return t.evaluate()
    .setTitle('Smart Clinic - Doctor Dashboard')
    .setFaviconUrl('https://www.google.com/images/branding/product/ico/googleg_standard_128.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getWebhookUrl() {
  var prop = PropertiesService.getScriptProperties().getProperty('N8N_WEBHOOK_URL');
  if (prop) return prop;
  return 'YOUR_N8N_WEBHOOK_URL';
}

function getTodayString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
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

/**
 * Returns active doctor names from the Doctors sheet.
 */
function getDoctors() {
  var rows = readSheetRows('Doctors');
  return rows
    .filter(function(r) {
      var status = String(r.Status || '').trim().toLowerCase();
      return status === 'active' || status === '';
    })
    .map(function(r) { return String(r.Doctor_Name || ''); })
    .filter(function(name) { return name; })
    .sort();
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

function stringValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function copyAllFields(row, fields) {
  var out = {};
  fields.forEach(function(field) {
    out[field] = stringValue(row[field]);
  });
  return out;
}

/**
 * Returns dashboard data for today, optionally filtered by doctor name.
 */
function getData(doctorFilter) {
  var today = getTodayString();

  var appointmentFields = [
    'Patient_ID', 'Full_Name', 'Age', 'Sex', 'Phone_Number', 'Address',
    'Primary_Symptom', 'Doctor_Name', 'Date', 'Visit_Type', 'Chat_ID',
    'Token_Number', 'Status', 'Timestamp'
  ];

  var patientFields = [
    'Patient_ID', 'Full_Name', 'Age', 'Sex', 'Phone_Number', 'Address',
    'Primary_Symptom', 'Doctor_Name', 'Date', 'Visit_Type', 'Chat_ID',
    'Token_Number', 'Temperature_Celsius', 'Blood_Pressure_mmHg',
    'Heart_Rate_BPM', 'SpO2', 'Status', 'Doctor_Instructions',
    'Follow_Up_Date', 'Signature'
  ];

  var appointments = readSheetRows('Appointments').filter(function(r) {
    return String(r.Status || '').trim() === 'Scheduled' &&
           String(r.Date || '').trim() === today &&
           doctorMatches(r.Doctor_Name, doctorFilter);
  }).map(function(r) {
    return copyAllFields(r, appointmentFields);
  }).sort(function(a, b) {
    return (Number(a.Token_Number) || 0) - (Number(b.Token_Number) || 0);
  });

  var checkedIn = readSheetRows('Patients').filter(function(r) {
    return String(r.Status || '').trim() === 'Checked-in' &&
           String(r.Date || '').trim() === today &&
           doctorMatches(r.Doctor_Name, doctorFilter);
  }).map(function(r) {
    return copyAllFields(r, patientFields);
  }).sort(function(a, b) {
    return (Number(a.Token_Number) || 0) - (Number(b.Token_Number) || 0);
  });

  return {
    today: today,
    appointments: appointments,
    checkedIn: checkedIn
  };
}

/**
 * Sends the patient completion to the n8n webhook.
 */
function completePatient(patientId, instructions, followUpDate) {
  var url = getWebhookUrl();
  var payload = {
    Patient_ID: String(patientId),
    Doctor_Instructions: String(instructions || ''),
    Follow_Up_Date: String(followUpDate || '')
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
```

---

## Index.html

Create a file named `Index` in Apps Script and paste the following:

```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Smart Clinic - Doctor Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 16px; background: #f5f6f8; color: #333; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 12px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .toolbar select { padding: 8px 12px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; min-width: 220px; }
    .toolbar button { background: #2196F3; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
    @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
    .card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 16px; }
    .card h2 { margin: 0 0 12px; font-size: 16px; color: #444; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .list { max-height: 60vh; overflow-y: auto; }
    .item { border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #fafafa; }
    .item strong { font-size: 15px; color: #222; }
    .item small { display: block; color: #666; margin-top: 3px; font-size: 12px; }
    .item .meta { margin-top: 6px; font-size: 12px; color: #555; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; font-size: 12px; }
    .details div { background: #fff; padding: 5px 8px; border-radius: 4px; border: 1px solid #eee; }
    .details div.full { grid-column: 1 / -1; }
    .details .label { font-weight: 600; color: #555; display: block; font-size: 11px; text-transform: capitalize; }
    .details .value { color: #222; word-break: break-word; }
    .item button { margin-top: 10px; background: #4CAF50; color: white; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .item button:hover { background: #45a049; }
    .empty { color: #999; font-size: 13px; padding: 10px 0; }
    .form { background: #fff3e0; border: 1px solid #ffe0b2; border-radius: 6px; padding: 14px; margin-top: 12px; }
    .form h3 { margin: 0 0 10px; font-size: 15px; }
    label { display: block; font-size: 13px; margin-bottom: 8px; color: #444; }
    textarea, input[type=date] { width: 100%; padding: 8px; margin-top: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
    .form-actions { margin-top: 12px; }
    .form-actions button { padding: 8px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .form-actions .submit { background: #4CAF50; color: white; }
    .form-actions .cancel { background: #9e9e9e; color: white; margin-left: 8px; }
    #message { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 12px 18px; border-radius: 6px; display: none; font-size: 14px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .loading { color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Smart Clinic - Doctor Dashboard</h1>
  <div class="subtitle" id="subtitle">Loading...</div>

  <div class="toolbar">
    <div>
      <select id="doctorFilter"><option value="">Select doctor</option></select>
      <span class="loading" id="status">Loading...</span>
    </div>
    <button onclick="manualRefresh()">Refresh</button>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Scheduled Appointments</h2>
      <div id="appointments" class="list"><div class="empty">Loading...</div></div>
    </div>

    <div class="card">
      <h2>Checked-in Patients</h2>
      <div id="checkedIn" class="list"><div class="empty">Loading...</div></div>
    </div>
  </div>

  <div id="message"></div>

  <script>
    const $ = (id) => document.getElementById(id);
    let selectedPatient = null;
    let refreshTimer = null;
    let isSubmitting = false;
    let currentDoctor = '';

    const appointmentDisplayOrder = [
      'Token_Number', 'Patient_ID', 'Full_Name', 'Age', 'Sex', 'Phone_Number', 'Address',
      'Primary_Symptom', 'Doctor_Name', 'Date', 'Visit_Type', 'Chat_ID', 'Status', 'Timestamp'
    ];

    const patientDisplayOrder = [
      'Token_Number', 'Patient_ID', 'Full_Name', 'Age', 'Sex', 'Phone_Number', 'Address',
      'Primary_Symptom', 'Doctor_Name', 'Date', 'Visit_Type', 'Chat_ID',
      'Temperature_Celsius', 'Blood_Pressure_mmHg', 'Heart_Rate_BPM', 'SpO2',
      'Status', 'Doctor_Instructions', 'Follow_Up_Date', 'Signature'
    ];

    const friendlyNames = {
      Token_Number: 'Token Number',
      Patient_ID: 'Patient ID',
      Full_Name: 'Full Name',
      Phone_Number: 'Phone Number',
      Primary_Symptom: 'Primary Symptom',
      Doctor_Name: 'Doctor',
      Chat_ID: 'Chat ID',
      Visit_Type: 'Visit Type',
      Temperature_Celsius: 'Temperature (C)',
      Blood_Pressure_mmHg: 'Blood Pressure (mmHg)',
      Heart_Rate_BPM: 'Heart Rate (BPM)',
      SpO2: 'SpO2 (%)',
      Doctor_Instructions: 'Doctor Instructions',
      Follow_Up_Date: 'Follow-up Date'
    };

    function showMessage(text, isError) {
      const el = $('message');
      el.textContent = text;
      el.className = isError ? 'error' : 'success';
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 6000);
    }

    function setStatus(text) {
      $('status').textContent = text;
    }

    function getUrlDoctor() {
      const params = new URLSearchParams(window.location.search);
      return params.get('doctor') || '';
    }

    function init() {
      currentDoctor = getUrlDoctor();
      loadDoctors();
    }

    function normalizeDoctor(name) {
      return String(name || '')
        .toLowerCase()
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function isMyPatient(rowDoctor) {
      if (!currentDoctor) return false;
      var row = normalizeDoctor(rowDoctor);
      var filter = normalizeDoctor(currentDoctor);
      if (!row || !filter) return false;
      return row.split(',').map(function(p) { return p.trim(); }).filter(function(p) { return p; }).some(function(p) { return p === filter; });
    }

    function loadDoctors() {
      google.script.run
        .withSuccessHandler(function(doctors) {
          const select = $('doctorFilter');
          select.innerHTML = '<option value="">Select doctor</option>';
          doctors.forEach(function(doc) {
            const opt = document.createElement('option');
            opt.value = doc;
            opt.textContent = doc;
            select.appendChild(opt);
          });
          if (currentDoctor) {
            select.value = currentDoctor;
          }
          select.addEventListener('change', function() {
            currentDoctor = select.value;
            if (currentDoctor) {
              loadData(currentDoctor);
            } else {
              renderData({ today: '', appointments: [], checkedIn: [] });
              setStatus('Select a doctor');
            }
          });
          if (currentDoctor) {
            loadData(currentDoctor);
          } else {
            renderData({ today: '', appointments: [], checkedIn: [] });
            setStatus('Select a doctor');
          }
        })
        .withFailureHandler(function(err) {
          setStatus('Error: ' + err.message);
          showMessage(err.message, true);
        })
        .getDoctors();
    }

    function loadData(doctorFilter) {
      setStatus('Loading...');
      google.script.run
        .withSuccessHandler(renderData)
        .withFailureHandler(function(err) {
          setStatus('Error: ' + err.message);
          showMessage(err.message, true);
        })
        .getData(doctorFilter);
    }

    function renderData(data) {
      setStatus('Last updated: ' + new Date().toLocaleTimeString());
      const filterText = currentDoctor ? ' for ' + currentDoctor : '';
      $('subtitle').textContent = 'Today: ' + data.today + filterText;
      renderAppointments(data.appointments || []);
      renderCheckedIn(data.checkedIn || []);
    }

    function renderDetails(item, fields, fullWidthFields) {
      if (!fields) return '';
      return '<div class="details">' + fields.map(function(field) {
        const raw = item[field];
        if (!raw && raw !== 0 && raw !== false) return '';
        const label = friendlyNames[field] || field.replace(/_/g, ' ');
        const isFull = (fullWidthFields && fullWidthFields.indexOf(field) >= 0);
        const cls = isFull ? ' class="full"' : '';
        return '<div' + cls + '><span class="label">' + escapeHtml(label) + '</span><span class="value">' + escapeHtml(raw) + '</span></div>';
      }).filter(Boolean).join('') + '</div>';
    }

    function renderAppointments(list) {
      const container = $('appointments');
      if (!list.length) {
        container.innerHTML = '<div class="empty">No scheduled appointments for today.</div>';
        return;
      }
      container.innerHTML = list.map(function(p) {
        return '<div class="item">' +
          renderDetails(p, appointmentDisplayOrder) +
          '</div>';
      }).join('');
    }

    function renderCheckedIn(list) {
      const container = $('checkedIn');
      if (!list.length) {
        container.innerHTML = '<div class="empty">No checked-in patients for today.</div>';
        return;
      }
      container.innerHTML = list.map(function(p, i) {
        const canComplete = isMyPatient(p.Doctor_Name);
        const actionButton = canComplete
          ? '<button onclick="openForm(' + i + ')">Complete</button>'
          : '<small style="color:#999">View only (not your patient)</small>';
        return '<div class="item" data-idx="' + i + '">' +
          renderDetails(p, patientDisplayOrder, ['Address', 'Doctor_Instructions', 'Follow_Up_Date', 'Signature']) +
          actionButton +
          '</div>';
      }).join('');
      window.checkedInPatients = list;
    }

    function openForm(index) {
      if (isSubmitting) return;
      selectedPatient = window.checkedInPatients[index];
      if (!selectedPatient || !isMyPatient(selectedPatient.Doctor_Name)) {
        showMessage('You can only complete your own patients.', true);
        return;
      }
      const container = $('checkedIn');
      container.innerHTML = '<div class="form">' +
        '<h3>Complete ' + escapeHtml(selectedPatient.Full_Name) + '</h3>' +
        '<label>Doctor Instructions' +
          '<textarea id="instructions" rows="4">' + escapeHtml(selectedPatient.Doctor_Instructions || '') + '</textarea>' +
        '</label>' +
        '<label>Follow-up Date' +
          '<input type="date" id="followUpDate" value="' + escapeHtml(selectedPatient.Follow_Up_Date || '') + '">' +
        '</label>' +
        '<div class="form-actions">' +
          '<button class="submit" onclick="submitForm()">Complete &amp; Call Next</button>' +
          '<button class="cancel" onclick="loadData(currentDoctor)">Cancel</button>' +
        '</div>' +
      '</div>';
    }

    function submitForm() {
      if (!selectedPatient || isSubmitting || !isMyPatient(selectedPatient.Doctor_Name)) return;
      const instructions = $('instructions').value;
      const followUpDate = $('followUpDate').value;
      isSubmitting = true;
      showMessage('Submitting...', false);

      google.script.run
        .withSuccessHandler(function(result) {
          isSubmitting = false;
          showMessage(result.message || 'Done', false);
          loadData(currentDoctor);
        })
        .withFailureHandler(function(err) {
          isSubmitting = false;
          showMessage('Error: ' + err.message, true);
        })
        .completePatient(selectedPatient.Patient_ID, instructions, followUpDate);
    }

    function manualRefresh() {
      clearTimeout(refreshTimer);
      loadDoctors();
      scheduleRefresh();
    }

    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function() {
        if (!isSubmitting) loadDoctors();
        scheduleRefresh();
      }, 30000);
    }

    function escapeHtml(text) {
      if (text === null || text === undefined) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    window.onload = function() { init(); scheduleRefresh(); };
  </script>
</body>
</html>
```
