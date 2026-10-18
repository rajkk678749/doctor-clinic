const STORAGE_KEY = 'clinicQueueData';
const AUTH_KEY = 'clinicAuthState';
const doctorNameElement = document.getElementById('doctorName');
const clinicNameElement = document.getElementById('clinicName');
const receptionNameElement = document.getElementById('receptionName');
const clinicHoursElement = document.getElementById('clinicHours');
const queueStatusElement = document.getElementById('queueStatus');
const queueMessage = document.getElementById('queueMessage');
const patientCountElement = document.getElementById('patientCount');
const patientCountToggle = document.getElementById('patientCountToggle');
const patientListPanel = document.getElementById('patientListPanel');
const patientList = document.getElementById('patientList');

const statusLabels = {
  waiting: 'Waiting',
  arrived: 'Arrived',
  attended: 'Attended',
  skipped: 'Skipped',
  served: 'Served',
};

function readStoredJson(key, fallback) {
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : fallback;
}

function redirectToLogin() {
  window.location.replace('login.html');
}

function showMessage(message, type = '') {
  queueMessage.textContent = message;
  queueMessage.className = 'status-text';
  if (type) queueMessage.classList.add(type);
}

function normalizeTime(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const time24 = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (time24) return value;
  const time12 = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!time12) return fallback;
  let hours = Number(time12[1]) % 12;
  if (time12[3].toUpperCase() === 'PM') hours += 12;
  return `${String(hours).padStart(2, '0')}:${time12[2]}`;
}

function formatTime(value) {
  const [hourValue, minute] = value.split(':');
  const hours = Number(hourValue);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${minute} ${period}`;
}

function getWaitingPatients(data) {
  return data.patients.filter((patient) => !['served', 'skipped'].includes(patient.status));
}

function migratePatientQueue(data) {
  if (!data) return data;
  if (!Array.isArray(data.patients)) {
    const oldCount = Number.isInteger(data.waitingPatients) && data.waitingPatients > 0
      ? Math.min(data.waitingPatients, 1000)
      : 0;
    data.patients = Array.from({ length: oldCount }, (_, index) => ({
      id: `legacy-${index + 1}`,
      tokenNumber: index + 1,
      name: 'Existing patient',
      mobileNumber: '',
      addedAt: new Date().toISOString(),
      status: 'waiting',
    }));
  }

  let nextToken = data.patients.reduce((max, patient) => Math.max(max, Number(patient.tokenNumber) || 0), 0) + 1;
  data.patients.forEach((patient) => {
    if (!Number.isInteger(Number(patient.tokenNumber)) || Number(patient.tokenNumber) < 1) {
      patient.tokenNumber = nextToken;
      nextToken += 1;
    } else {
      patient.tokenNumber = Number(patient.tokenNumber);
    }
    if (!statusLabels[patient.status]) patient.status = 'waiting';
  });
  data.waitingPatients = getWaitingPatients(data).length;
  return data;
}

function isAuthorized(auth, data) {
  return Boolean(
    auth &&
    auth.role === 'receptionist' &&
    String(auth.receptionistName || '').toLowerCase() === String(data?.receptionName || '').toLowerCase() &&
    Date.now() < Number(auth.expiresAt || 0) &&
    data &&
    data.receptionEnabled === true &&
    data.receptionMobile === auth.mobileNumber &&
    data.mobileNumber === auth.clinicMobileNumber
  );
}

function createStatusButton(patient, status) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `patient-action-btn patient-action-${status}`;
  button.textContent = statusLabels[status];
  button.disabled = patient.status === status || !isAllowedStatusChange(patient.status, status);
  button.addEventListener('click', () => updatePatientStatus(patient.id, status));
  return button;
}

function isAllowedStatusChange(currentStatus, nextStatus) {
  const transitions = {
    waiting: ['arrived', 'skipped'],
    arrived: ['attended', 'skipped'],
    attended: ['served'],
    skipped: [],
    served: [],
  };
  return transitions[currentStatus]?.includes(nextStatus) || false;
}

function renderPatientList(data) {
  const waitingPatients = getWaitingPatients(data);
  patientCountElement.textContent = String(waitingPatients.length);
  patientCountToggle.setAttribute('aria-label', `${waitingPatients.length} patients in queue. Click to manage patient statuses.`);
  patientList.replaceChildren();

  if (waitingPatients.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-patient-list';
    emptyMessage.textContent = 'No patients are currently waiting.';
    patientList.append(emptyMessage);
    return;
  }

  const table = document.createElement('table');
  table.className = 'patient-list-table reception-patient-table';
  const header = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Token number', 'Name', 'Number', 'Status', 'Update status']) {
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

    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `patient-status-badge status-${patient.status}`;
    statusBadge.textContent = statusLabels[patient.status];
    statusCell.append(statusBadge);
    row.append(statusCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'patient-actions-cell';
    const actions = document.createElement('div');
    actions.className = 'patient-action-buttons';
    for (const status of ['arrived', 'attended', 'skipped', 'served']) {
      actions.append(createStatusButton(patient, status));
    }
    actionsCell.append(actions);
    row.append(actionsCell);
    body.append(row);
  }
  table.append(body);
  patientList.append(table);
}

function renderDashboard(data) {
  doctorNameElement.textContent = data.doctorName || 'Doctor';
  clinicNameElement.textContent = data.clinicName || 'Clinic';
  receptionNameElement.textContent = `Reception: ${data.receptionName || 'Staff'}`;

  const start = normalizeTime(data.clinicStartTime || data.startTime, '09:00');
  const stop = normalizeTime(data.clinicStopTime || data.endTime, '18:00');
  clinicHoursElement.textContent = `${formatTime(start)} – ${formatTime(stop)}`;

  const isRunning = data.queueStatus === 'running';
  queueStatusElement.textContent = isRunning ? 'Running' : 'Stopped';
  queueStatusElement.className = `queue-badge ${isRunning ? 'running' : 'stopped'}`;
  renderPatientList(data);
}

function loadDashboard() {
  try {
    const auth = readStoredJson(AUTH_KEY, null);
    const data = migratePatientQueue(readStoredJson(STORAGE_KEY, null));
    if (!isAuthorized(auth, data)) {
      localStorage.removeItem(AUTH_KEY);
      redirectToLogin();
      return;
    }
    data.waitingPatients = getWaitingPatients(data).length;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderDashboard(data);
  } catch (error) {
    showMessage(error.message || 'Could not load the reception dashboard.', 'error');
  }
}

function updatePatientStatus(patientId, nextStatus) {
  try {
    const auth = readStoredJson(AUTH_KEY, null);
    const data = migratePatientQueue(readStoredJson(STORAGE_KEY, null));
    if (!isAuthorized(auth, data)) {
      localStorage.removeItem(AUTH_KEY);
      redirectToLogin();
      return;
    }

    const patient = data.patients.find((entry) => entry.id === patientId);
    if (!patient || !isAllowedStatusChange(patient.status, nextStatus)) return;

    const previousStatus = patient.status;
    const changedAt = new Date().toISOString();
    patient.status = nextStatus;
    patient.statusUpdatedAt = changedAt;
    if (!Array.isArray(patient.statusHistory)) patient.statusHistory = [];
    patient.statusHistory.push({ status: nextStatus, at: changedAt, by: auth.receptionistName || data.receptionName });

    if (!Array.isArray(data.patientEvents)) data.patientEvents = [];
    if (nextStatus === 'arrived') data.patientEvents.push({ type: 'arrival', at: changedAt });
    if (nextStatus === 'attended') data.patientEvents.push({ type: 'attended', at: changedAt });
    if (nextStatus === 'skipped') data.patientEvents.push({ type: 'skipped', at: changedAt });
    if (nextStatus === 'served') data.patientEvents.push({ type: 'served', at: changedAt });

    data.waitingPatients = getWaitingPatients(data).length;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderDashboard(data);
    showMessage(`${patient.name || 'Patient'}: ${statusLabels[previousStatus]} → ${statusLabels[nextStatus]}.`, 'success');
  } catch (error) {
    showMessage(error.message || 'Could not update patient status.', 'error');
  }
}

patientCountToggle.addEventListener('click', () => {
  const isExpanded = patientCountToggle.getAttribute('aria-expanded') === 'true';
  patientCountToggle.setAttribute('aria-expanded', String(!isExpanded));
  patientListPanel.classList.toggle('hidden', isExpanded);
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(AUTH_KEY);
  redirectToLogin();
});

window.addEventListener('storage', (event) => {
  if (event.key === AUTH_KEY && !event.newValue) redirectToLogin();
  if (event.key === AUTH_KEY || event.key === STORAGE_KEY) loadDashboard();
});

loadDashboard();
