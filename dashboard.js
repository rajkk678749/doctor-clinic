const STORAGE_KEY = 'clinicQueueData';
const AUTH_KEY = 'clinicAuthState';
const doctorNameElement = document.getElementById('doctorName');
const clinicNameElement = document.getElementById('clinicName');
const queueStatusElement = document.getElementById('queueStatus');
const queueDescription = document.getElementById('queueDescription');
const queueMessage = document.getElementById('queueMessage');
const startQueueBtn = document.getElementById('startQueueBtn');
const stopQueueBtn = document.getElementById('stopQueueBtn');
const patientCountElement = document.getElementById('patientCount');
const patientCountToggle = document.getElementById('patientCountToggle');
const patientListPanel = document.getElementById('patientListPanel');
const patientList = document.getElementById('patientList');
const clinicHoursForm = document.getElementById('clinicHoursForm');
const clinicStartTime = document.getElementById('clinicStartTime');
const clinicStopTime = document.getElementById('clinicStopTime');
const hoursMessage = document.getElementById('hoursMessage');

function redirectToLogin() {
  window.location.replace('login.html');
}

function readStoredJson(key, fallback) {
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : fallback;
}

function showMessage(element, message, type = '') {
  element.textContent = message;
  element.className = 'status-text';
  if (type) element.classList.add(type);
}

function isValidAuth(auth, data) {
  return auth &&
    auth.role === 'doctor' &&
    Date.now() < Number(auth.expiresAt || 0) &&
    data &&
    data.mobileNumber === auth.mobileNumber;
}

function normalizeTime(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const time24 = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (time24) return `${time24[1]}:${time24[2]}`;

  const time12 = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!time12) return fallback;
  let hours = Number(time12[1]) % 12;
  if (time12[3].toUpperCase() === 'PM') hours += 12;
  return `${String(hours).padStart(2, '0')}:${time12[2]}`;
}

function formatTimeForLegacyField(value) {
  const [hours, minutes] = value.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

function getWaitingPatients(data) {
  return data.patients.filter((patient) => !['served', 'skipped'].includes(patient.status));
}

function assignMissingTokens(patients) {
  let nextToken = patients.reduce((maxToken, patient) => {
    const token = Number(patient.tokenNumber);
    return Number.isInteger(token) && token > maxToken ? token : maxToken;
  }, 0) + 1;

  for (const patient of patients) {
    const token = Number(patient.tokenNumber);
    if (!Number.isInteger(token) || token < 1) {
      patient.tokenNumber = nextToken;
      nextToken += 1;
    } else {
      patient.tokenNumber = token;
    }
  }
}

function migratePatientQueue(data) {
  if (!data) return data;
  if (!Array.isArray(data.patients)) {
    const oldCount = Number.isInteger(data.waitingPatients) && data.waitingPatients > 0
      ? Math.min(data.waitingPatients, 1000)
      : 0;
    data.patients = Array.from({ length: oldCount }, (_, index) => ({
      id: `legacy-${index + 1}`,
      name: 'Existing patient',
      mobileNumber: '',
      addedAt: new Date().toISOString(),
      status: 'waiting',
      legacy: true,
    }));
  }
  data.patients.forEach((patient) => {
    if (!['waiting', 'arrived', 'attended', 'skipped', 'served'].includes(patient.status)) {
      patient.status = 'waiting';
    }
  });
  assignMissingTokens(data.patients);
  data.waitingPatients = getWaitingPatients(data).length;
  return data;
}

function renderPatientList(data) {
  const waitingPatients = getWaitingPatients(data);
  patientCountElement.textContent = String(waitingPatients.length);
  patientCountToggle.setAttribute('aria-label', `${waitingPatients.length} patients in queue. Click to view patient details.`);
  patientList.replaceChildren();

  if (waitingPatients.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-patient-list';
    emptyMessage.textContent = 'No patients are currently waiting.';
    patientList.append(emptyMessage);
    return;
  }

  const table = document.createElement('table');
  table.className = 'patient-list-table';
  const header = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Token number', 'Name', 'Number']) {
    const heading = document.createElement('th');
    heading.scope = 'col';
    heading.textContent = label;
    headerRow.append(heading);
  }
  header.append(headerRow);
  table.append(header);

  const body = document.createElement('tbody');
  const sortedPatients = [...waitingPatients].sort((left, right) => left.tokenNumber - right.tokenNumber);
  for (const patient of sortedPatients) {
    const row = document.createElement('tr');
    for (const value of [patient.tokenNumber, patient.name || 'Patient', patient.mobileNumber || 'Not provided']) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  patientList.append(table);
}

function renderDashboard(data) {
  doctorNameElement.textContent = data.doctorName || 'Doctor';
  clinicNameElement.textContent = data.clinicName || 'Clinic';
  clinicStartTime.value = normalizeTime(data.clinicStartTime || data.startTime, '09:00');
  clinicStopTime.value = normalizeTime(data.clinicStopTime || data.endTime, '18:00');

  const isRunning = data.queueStatus === 'running';
  queueStatusElement.textContent = isRunning ? 'Running' : 'Stopped';
  queueStatusElement.className = `queue-badge ${isRunning ? 'running' : 'stopped'}`;
  queueDescription.textContent = isRunning
    ? 'Queue is running and accepting patients.'
    : 'Queue is stopped.';
  startQueueBtn.disabled = isRunning;
  stopQueueBtn.disabled = !isRunning;
  renderPatientList(data);
}

function getAuthorizedClinic() {
  const auth = readStoredJson(AUTH_KEY, null);
  const data = migratePatientQueue(readStoredJson(STORAGE_KEY, null));
  if (!isValidAuth(auth, data)) {
    localStorage.removeItem(AUTH_KEY);
    redirectToLogin();
    return null;
  }
  return { data };
}

function saveQueueState(nextStatus) {
  try {
    const clinic = getAuthorizedClinic();
    if (!clinic) return;

    const changedAt = new Date().toISOString();
    clinic.data.queueStatus = nextStatus;
    if (nextStatus === 'running') {
      clinic.data.queueStartedAt = changedAt;
      clinic.data.queueStoppedAt = null;
    } else {
      clinic.data.queueStoppedAt = changedAt;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(clinic.data));
    renderDashboard(clinic.data);
    showMessage(queueMessage, nextStatus === 'running' ? 'Queue started.' : 'Queue stopped.', 'success');
  } catch (error) {
    showMessage(queueMessage, error.message || 'Could not update the queue. Please try again.', 'error');
  }
}

function saveClinicHours(event) {
  event.preventDefault();
  if (!clinicHoursForm.reportValidity()) return;

  if (clinicStartTime.value >= clinicStopTime.value) {
    showMessage(hoursMessage, 'Stop time must be later than start time.', 'error');
    return;
  }

  try {
    const clinic = getAuthorizedClinic();
    if (!clinic) return;
    clinic.data.clinicStartTime = clinicStartTime.value;
    clinic.data.clinicStopTime = clinicStopTime.value;
    clinic.data.startTime = formatTimeForLegacyField(clinicStartTime.value);
    clinic.data.endTime = formatTimeForLegacyField(clinicStopTime.value);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clinic.data));
    showMessage(hoursMessage, 'Clinic hours saved.', 'success');
  } catch (error) {
    showMessage(hoursMessage, error.message || 'Could not save clinic hours.', 'error');
  }
}

function initializeDashboard() {
  try {
    const auth = readStoredJson(AUTH_KEY, null);
    const data = migratePatientQueue(readStoredJson(STORAGE_KEY, null));
    if (!isValidAuth(auth, data)) {
      localStorage.removeItem(AUTH_KEY);
      redirectToLogin();
      return;
    }
    data.waitingPatients = getWaitingPatients(data).length;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderDashboard(data);
  } catch (error) {
    showMessage(queueMessage, error.message || 'Could not load dashboard details.', 'error');
  }
}

startQueueBtn.addEventListener('click', () => saveQueueState('running'));
stopQueueBtn.addEventListener('click', () => saveQueueState('stopped'));
patientCountToggle.addEventListener('click', () => {
  const isExpanded = patientCountToggle.getAttribute('aria-expanded') === 'true';
  patientCountToggle.setAttribute('aria-expanded', String(!isExpanded));
  patientListPanel.classList.toggle('hidden', isExpanded);
});
clinicHoursForm.addEventListener('submit', saveClinicHours);
window.addEventListener('storage', (event) => {
  if (event.key === AUTH_KEY && !event.newValue) redirectToLogin();
  if (event.key === AUTH_KEY || event.key === STORAGE_KEY) initializeDashboard();
});

initializeDashboard();
