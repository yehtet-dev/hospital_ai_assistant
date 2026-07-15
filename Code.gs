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
