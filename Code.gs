/**
 * Smart Clinic - Role-based Dashboard Web App (Google Apps Script)
 *
 * Serves an HTML dashboard with custom email/password login and role-based
 * access (Doctor / Admin). The user's session is stored in CacheService with
 * a token returned on login.
 *
 * Required sheets/tabs (exact column names):
 *   - Appointments: Patient_ID, Full_Name, Token_Number, Doctor_Name,
 *                   Primary_Symptom, Visit_Type, Status, Date
 *   - Patients:     Patient_ID, Full_Name, Token_Number, Doctor_Name,
 *                   Primary_Symptom, Temperature_Celsius, Blood_Pressure_mmHg,
 *                   Heart_Rate_BPM, SpO2, Status, Date, Doctor_Instructions,
 *                   Follow_Up_Date, Signature
 *   - Live_Queue:   Doctor_Name, Current_Queue_Number, Date
 *   - Doctors:      Doctor_Name, Email, Status, Specialty, Avg_Time, ...
 *   - Users:        Email, Name, Role, Doctor_Name, PasswordHash, Status, Created_At
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

function getUser() {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    return { email: '', name: '', role: 'none', doctorName: '' };
  }
  var normalized = normalizeEmail(email);

  try {
    var admins = readSheetRows('Admins');
    for (var i = 0; i < admins.length; i++) {
      if (normalizeEmail(admins[i].Email) === normalized) {
        var adminStatus = String(admins[i].Status || '').trim().toLowerCase();
        if (adminStatus === 'active' || adminStatus === '') {
          return { email: email, name: String(admins[i].Name || ''), role: 'admin', doctorName: '' };
        }
      }
    }
  } catch (e) { /* Admins sheet may not exist yet */ }

  try {
    var doctors = readSheetRows('Doctors');
    for (var j = 0; j < doctors.length; j++) {
      if (normalizeEmail(doctors[j].Email) === normalized) {
        var doctorStatus = String(doctors[j].Status || '').trim().toLowerCase();
        if (doctorStatus === 'active' || doctorStatus === '') {
          var doctorName = String(doctors[j].Doctor_Name || '');
          return { email: email, name: doctorName, role: 'doctor', doctorName: doctorName };
        }
      }
    }
  } catch (e) { /* Doctors sheet may not exist yet */ }

  return { email: email, name: '', role: 'none', doctorName: '' };
}

/* ---------- Auth helpers ---------- */

function getSalt() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('AUTH_SALT');
  if (!salt) {
    salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('AUTH_SALT', salt);
  }
  return salt;
}

function hashPassword(password) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    getSalt() + password,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function ensureUsersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.appendRow(['Email', 'Name', 'Role', 'Doctor_Name', 'PasswordHash', 'Status', 'Created_At']);
  }
  return sheet;
}

function readUsers() {
  try {
    return readSheetRows('Users');
  } catch (e) {
    ensureUsersSheet();
    return readSheetRows('Users');
  }
}

function findUserRow(email) {
  email = normalizeEmail(email);
  var users = readUsers();
  for (var i = 0; i < users.length; i++) {
    if (normalizeEmail(users[i].Email) === email) return users[i];
  }
  return null;
}

function updateUserStatusInSheet(email, status) {
  email = normalizeEmail(email);
  var sheet = ensureUsersSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === email) {
      sheet.getRange(i + 1, 6).setValue(status);
      return true;
    }
  }
  return false;
}

function deleteUserFromSheet(email) {
  email = normalizeEmail(email);
  var sheet = ensureUsersSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === email) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function createSession(user) {
  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put(token, JSON.stringify(user), 3600); // 1 hour
  return token;
}

function getSession(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get(token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function removeSession(token) {
  if (!token) return;
  CacheService.getScriptCache().remove(token);
}

function validateToken(token) {
  var session = getSession(token);
  if (!session) throw new Error('Session expired. Please log in again.');
  var user = findUserRow(session.email);
  if (!user) throw new Error('User not found. Please log in again.');
  if (String(user.Status || '').trim().toLowerCase() !== 'active') {
    removeSession(token);
    throw new Error('Account is not active. Contact admin.');
  }
  return {
    email: normalizeEmail(user.Email),
    name: String(user.Name || ''),
    role: String(user.Role || '').toLowerCase().trim(),
    doctorName: String(user.Doctor_Name || '')
  };
}

/* ---------- Public auth endpoints ---------- */

function signup(email, password, name, role, doctorName) {
  if (!email || !password) throw new Error('Email and password are required');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  email = normalizeEmail(email);

  var users = readUsers();
  for (var i = 0; i < users.length; i++) {
    if (normalizeEmail(users[i].Email) === email) throw new Error('Email is already registered');
  }

  var isFirstUser = users.length === 0;
  var finalRole = isFirstUser ? 'admin' : String(role || 'doctor').toLowerCase().trim();
  var finalStatus = isFirstUser ? 'Active' : 'Pending';
  var finalDoctorName = finalRole === 'doctor' ? String(doctorName || '') : '';

  if (finalRole === 'doctor' && !finalDoctorName) {
    throw new Error('Please select a doctor for doctor accounts');
  }

  var hash = hashPassword(password);
  var now = new Date().toISOString();
  ensureUsersSheet().appendRow([email, name || '', finalRole, finalDoctorName, hash, finalStatus, now]);

  return {
    success: true,
    status: finalStatus,
    role: finalRole,
    message: isFirstUser
      ? 'Admin account created. You can log in now.'
      : 'Account created. Wait for admin approval.'
  };
}

function login(email, password) {
  if (!email || !password) throw new Error('Email and password are required');
  email = normalizeEmail(email);

  var user = findUserRow(email);
  if (!user) throw new Error('Invalid email or password');
  if (hashPassword(password) !== String(user.PasswordHash || '')) throw new Error('Invalid email or password');

  var status = String(user.Status || '').trim().toLowerCase();
  if (status === 'pending') throw new Error('Account is pending admin approval');
  if (status !== 'active') throw new Error('Account is not active');

  var sessionUser = {
    email: email,
    name: String(user.Name || ''),
    role: String(user.Role || '').toLowerCase().trim(),
    doctorName: String(user.Doctor_Name || '')
  };
  var token = createSession(sessionUser);
  return { success: true, token: token, user: sessionUser };
}

function logout(token) {
  removeSession(token);
  return { success: true };
}

function getCurrentUser(token) {
  return validateToken(token);
}

/* ---------- Dashboard data ---------- */

function getActiveDoctors() {
  getUser();
  return readSheetRows('Doctors')
    .filter(function(r) {
      var status = String(r.Status || '').trim().toLowerCase();
      return status === 'active' || status === '';
    })
    .map(function(r) { return String(r.Doctor_Name || ''); })
    .filter(function(name) { return name; })
    .sort();
}

function stringValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function copyAllFields(row, fields) {
  var out = {};
  for (var i = 0; i < fields.length; i++) {
    out[fields[i]] = stringValue(row[fields[i]]);
  }
  return out;
}

function getData(doctorFilter, dateFilter) {
  var user = getUser();
  var today = getTodayString();
  var filter = '';
  var allDoctors = false;
  var filterDate = String(dateFilter || today).trim();

  if (user.role === 'doctor') {
    filter = user.doctorName;
  } else if (user.role === 'admin') {
    filter = String(doctorFilter || '').trim();
    allDoctors = filter === '';
  } else {
    throw new Error('Not authorized');
  }

  var appointmentFields = [
    'Patient_ID', 'Full_Name', 'Age', 'Sex', 'Phone_Number', 'Address',
    'Primary_Symptom', 'Doctor_Name', 'Date', 'Visit_Type', 'Chat_ID',
    'Token_Number', 'Status', 'Timestamp'
  ];

  var patientFields = [
    'Patient_ID', 'Full_Name', 'Age', 'Sex', 'Phone_Number', 'Address',
    'Primary_Symptom', 'Doctor_Name', 'Date', 'Visit_Type', 'Chat_ID',
    'Token_Number', 'Temperature_Celsius', 'Blood_Pressure_mmHg',
    'Heart_Rate_BPM', 'SpO2', 'Nurse_Name', 'Status', 'Doctor_Instructions',
    'Follow_Up_Date', 'Signature'
  ];

  var appointments = readSheetRows('Appointments').filter(function(r) {
    return String(r.Status || '').trim() === 'Scheduled' &&
           String(r.Date || '').trim() === filterDate &&
           (allDoctors || doctorMatches(r.Doctor_Name, filter));
  }).map(function(r) {
    return copyAllFields(r, appointmentFields);
  }).sort(function(a, b) {
    return (Number(a.Token_Number) || 0) - (Number(b.Token_Number) || 0);
  });

  var checkedIn = readSheetRows('Patients').filter(function(r) {
    return String(r.Status || '').trim() === 'Checked-in' &&
           String(r.Date || '').trim() === filterDate &&
           (allDoctors || doctorMatches(r.Doctor_Name, filter));
  }).map(function(r) {
    return copyAllFields(r, patientFields);
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
      return copyAllFields(r, patientFields);
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

/* ---------- Admin management ---------- */

function requireAdmin(token) {
  var user = getUser();
  if (user.role !== 'admin') throw new Error('Admin access required');
  return user;
}

function getAllDoctors() {
  requireAdmin();
  return readSheetRows('Doctors').map(function(r) {
    return {
      Doctor_Name: String(r.Doctor_Name || ''),
      Email: String(r.Email || ''),
      Status: String(r.Status || ''),
      Specialty: String(r.Specialty || '')
    };
  });
}

function updateDoctor(doctorName, email, status) {
  requireAdmin();

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

function getUsers() {
  requireAdmin();
  return readUsers();
}

function updateUserStatus(email, status) {
  requireAdmin();
  if (!email) throw new Error('Email required');
  if (updateUserStatusInSheet(email, status)) {
    return { success: true, email: email, status: status };
  }
  throw new Error('User not found');
}

function updateUserRole(email, role, doctorName) {
  requireAdmin();
  if (!email) throw new Error('Email required');
  role = String(role || '').toLowerCase().trim();
  if (role !== 'admin' && role !== 'doctor') throw new Error('Role must be admin or doctor');
  if (role === 'doctor' && !doctorName) throw new Error('Doctor name required for doctor role');

  var sheet = ensureUsersSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === normalizeEmail(email)) {
      sheet.getRange(i + 1, 3).setValue(role);
      sheet.getRange(i + 1, 4).setValue(role === 'doctor' ? String(doctorName || '') : '');
      return { success: true, email: email, role: role, doctorName: doctorName };
    }
  }
  throw new Error('User not found');
}

function deleteUser(email) {
  requireAdmin();
  if (!email) throw new Error('Email required');
  if (deleteUserFromSheet(email)) {
    return { success: true, email: email };
  }
  throw new Error('User not found');
}

function resetPassword(email, newPassword) {
  requireAdmin();
  if (!email || !newPassword) throw new Error('Email and new password required');
  if (newPassword.length < 6) throw new Error('Password must be at least 6 characters');

  var sheet = ensureUsersSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === normalizeEmail(email)) {
      sheet.getRange(i + 1, 5).setValue(hashPassword(newPassword));
      return { success: true, email: email };
    }
  }
  throw new Error('User not found');
}

/* ---------- Admins sheet helpers ---------- */

function ensureAdminsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Admins');
  if (!sheet) {
    sheet = ss.insertSheet('Admins');
    sheet.appendRow(['Email', 'Name', 'Status']);
  }
  return sheet;
}

function readAdmins() {
  try {
    return readSheetRows('Admins');
  } catch (e) {
    ensureAdminsSheet();
    return readSheetRows('Admins');
  }
}

function getAdmins() {
  requireAdmin();
  return readAdmins();
}

function saveAdmin(email, name, status) {
  requireAdmin();
  if (!email) throw new Error('Email is required');

  var sheet = ensureAdminsSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var emailIdx = findColumnIndex(headers, 'Email');
  var nameIdx = findColumnIndex(headers, 'Name');
  var statusIdx = findColumnIndex(headers, 'Status');
  if (emailIdx < 0) throw new Error('Email column not found in Admins sheet');

  var normalized = normalizeEmail(email);
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][emailIdx]) === normalized) {
      if (nameIdx >= 0) sheet.getRange(i + 1, nameIdx + 1).setValue(String(name || ''));
      if (statusIdx >= 0) sheet.getRange(i + 1, statusIdx + 1).setValue(String(status || 'Active'));
      return { success: true, email: email, name: name, status: status };
    }
  }

  var row = [];
  for (var j = 0; j < headers.length; j++) {
    if (j === emailIdx) row.push(email);
    else if (j === nameIdx) row.push(String(name || ''));
    else if (j === statusIdx) row.push(String(status || 'Active'));
    else row.push('');
  }
  sheet.appendRow(row);
  return { success: true, email: email, name: name, status: status };
}

function removeAdmin(email) {
  requireAdmin();
  if (!email) throw new Error('Email is required');

  var sheet = ensureAdminsSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === normalizeEmail(email)) {
      sheet.deleteRow(i + 1);
      return { success: true, email: email };
    }
  }
  throw new Error('Admin not found');
}
