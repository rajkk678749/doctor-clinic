const STORAGE_KEY = 'clinicQueueData';
const clinicNameElement = document.getElementById('patientClinicName');
const queueStatusElement = document.getElementById('patientQueueStatus');
const joinForm = document.getElementById('patientJoinForm');
const joinButton = document.getElementById('joinQueueBtn');
const confirmation = document.getElementById('patientJoinConfirmation');
const statusMessage = document.getElementById('patientJoinMessage');
const trackingPanel = document.getElementById('patientQueueTracking');
const trackingMessage = document.getElementById('patientTrackingMessage');
const patientTokenStatus = document.getElementById('patientTokenStatus');
const currentServingPatient = document.getElementById('currentServingPatient');
const patientWaitEstimate = document.getElementById('patientWaitEstimate');
const patientArrivedBtn = document.getElementById('patientArrivedBtn');
const patientReminder = document.getElementById('patientReminder');
const messagePreviews = document.getElementById('patientMessagePreviews');
const smsPreview = document.getElementById('patientSmsPreview');
const whatsappPreview = document.getElementById('patientWhatsappPreview');
const PATIENT_SESSION_KEY = 'clinicPatientSession';
const MINUTES_PER_PATIENT = 6;

function readClinicData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

function getWaitingPatients(data) {
  return data.patients.filter((patient) => !['served', 'skipped'].includes(patient.status));
}

function migratePatients(data) {
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
  return data.patients;
}

function setStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = 'status-text';
  if (type) statusMessage.classList.add(type);
}

function getPatientSession() {
  try {
    return JSON.parse(sessionStorage.getItem(PATIENT_SESSION_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function getQueuePosition(data, patient) {
  const activePatients = getWaitingPatients(data)
    .sort((left, right) => Number(left.tokenNumber) - Number(right.tokenNumber));
  const patientIndex = activePatients.findIndex((entry) => entry.id === patient.id);
  if (patientIndex < 0) return null;

  const servingPatient = activePatients.find((entry) => entry.status === 'attended') || null;
  const patientsAhead = activePatients
    .slice(0, patientIndex)
    .filter((entry) => entry.id !== servingPatient?.id);
  return { activePatients, servingPatient, patientsAhead };
}

function setTrackingStatus(message, type = '') {
  trackingMessage.textContent = message;
  trackingMessage.className = 'status-text';
  if (type) trackingMessage.classList.add(type);
}

function renderPatientTracking(data) {
  const patientSession = getPatientSession();
  if (!patientSession || patientSession.clinicMobileNumber !== data.mobileNumber) {
    trackingPanel.classList.add('hidden');
    return;
  }

  const patient = data.patients?.find((entry) => entry.id === patientSession.patientId);
  if (!patient) {
    sessionStorage.removeItem(PATIENT_SESSION_KEY);
    trackingPanel.classList.add('hidden');
    return;
  }

  const position = getQueuePosition(data, patient);
  trackingPanel.classList.remove('hidden');
  patientArrivedBtn.disabled = patient.status !== 'waiting';
  patientArrivedBtn.textContent = patient.status === 'arrived' ? 'Arrival confirmed' : 'I have arrived';
  patientTokenStatus.textContent = `Token ${patient.tokenNumber} — ${patient.status.charAt(0).toUpperCase()}${patient.status.slice(1)}.`;

  if (patient.status === 'attended') {
    currentServingPatient.textContent = 'You are currently being seen.';
    patientWaitEstimate.textContent = 'Estimated wait: about 0 minutes.';
    patientReminder.classList.add('hidden');
    messagePreviews.classList.add('hidden');
    return;
  }
  if (patient.status === 'served') {
    currentServingPatient.textContent = 'Your appointment has been marked as served. Thank you.';
    patientWaitEstimate.textContent = '';
    patientReminder.classList.add('hidden');
    return;
  }
  if (patient.status === 'skipped') {
    currentServingPatient.textContent = 'Your queue entry was marked as skipped. Please contact reception for help.';
    patientWaitEstimate.textContent = '';
    patientReminder.classList.add('hidden');
    return;
  }

  currentServingPatient.textContent = position?.servingPatient
    ? `Currently serving: ${position.servingPatient.name || 'Patient'} (token ${position.servingPatient.tokenNumber}).`
    : 'The clinic has not marked a patient as currently being served yet.';
  const aheadCount = position?.patientsAhead.length ?? 0;
  const estimatedMinutes = aheadCount * MINUTES_PER_PATIENT;
  patientWaitEstimate.textContent = aheadCount === 0
    ? 'You are next. Estimated wait: about 0 minutes.'
    : `Patients ahead: ${aheadCount}. Estimated wait: about ${estimatedMinutes} minutes.`;

  if (aheadCount === 2) {
    patientReminder.textContent = 'Reminder: two patients are ahead of you. Please make your way to the clinic.';
    patientReminder.classList.remove('hidden');
    const reminder = `Reminder: 2 patients are ahead of you at ${data.clinicName || 'the clinic'}. Please make your way to the clinic.`;
    smsPreview.textContent = reminder;
    whatsappPreview.textContent = reminder;
    messagePreviews.classList.remove('hidden');
  } else {
    patientReminder.classList.add('hidden');
    messagePreviews.classList.add('hidden');
  }
}

function updatePage() {
  try {
    const data = readClinicData();
    if (!data) {
      clinicNameElement.textContent = '';
      queueStatusElement.textContent = 'Clinic queue is not available in this browser.';
      queueStatusElement.className = 'status-text error';
      joinButton.disabled = true;
      return;
    }

    clinicNameElement.textContent = data.clinicName || 'Clinic';
    if (data.queueStatus === 'running') {
      queueStatusElement.textContent = 'Queue is open. Submit your details to join.';
      queueStatusElement.className = 'status-text success';
      joinButton.disabled = false;
    } else {
      queueStatusElement.textContent = 'The clinic queue is currently closed.';
      queueStatusElement.className = 'status-text error';
      joinButton.disabled = true;
    }
    if (Array.isArray(data.patients)) renderPatientTracking(data);
  } catch (error) {
    queueStatusElement.textContent = 'Could not load the clinic queue.';
    queueStatusElement.className = 'status-text error';
    joinButton.disabled = true;
  }
}

patientArrivedBtn.addEventListener('click', () => {
  try {
    const patientSession = getPatientSession();
    const data = readClinicData();
    if (!patientSession || !data || patientSession.clinicMobileNumber !== data.mobileNumber) {
      throw new Error('Could not identify your queue entry. Please contact reception.');
    }
    const patient = data.patients?.find((entry) => entry.id === patientSession.patientId);
    if (!patient || patient.status !== 'waiting') {
      updatePage();
      return;
    }

    const changedAt = new Date().toISOString();
    patient.status = 'arrived';
    patient.statusUpdatedAt = changedAt;
    if (!Array.isArray(patient.statusHistory)) patient.statusHistory = [];
    patient.statusHistory.push({ status: 'arrived', at: changedAt, by: 'patient' });
    if (!Array.isArray(data.patientEvents)) data.patientEvents = [];
    data.patientEvents.push({ type: 'arrival', at: changedAt, patientId: patient.id });
    data.waitingPatients = getWaitingPatients(data).length;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setTrackingStatus("Your arrival status was updated in this browser's queue.", 'success');
    updatePage();
  } catch (error) {
    setTrackingStatus(error.message || 'Could not confirm your arrival.', 'error');
  }
});

function nextTokenNumber(patients) {
  return patients.reduce((maxToken, patient) => {
    const token = Number(patient.tokenNumber);
    return Number.isInteger(token) && token > maxToken ? token : maxToken;
  }, 0) + 1;
}

function createPatientId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `patient-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!joinForm.reportValidity()) return;

  const name = document.getElementById('patientName').value.trim();
  const mobileNumber = document.getElementById('patientMobile').value.trim();
  const digitCount = mobileNumber.replace(/\D/g, '').length;
  if (!name || digitCount < 10 || digitCount > 15) {
    setStatus('Enter your name and a valid mobile number (10 to 15 digits).', 'error');
    return;
  }

  try {
    const data = readClinicData();
    if (!data) {
      updatePage();
      return;
    }
    if (data.queueStatus !== 'running') {
      updatePage();
      setStatus('The clinic queue is closed. Please try again later.', 'error');
      return;
    }

    const patients = migratePatients(data);
    const tokenNumber = nextTokenNumber(patients);
    const joinedAt = new Date().toISOString();
    patients.push({
      id: createPatientId(),
      tokenNumber,
      name,
      mobileNumber,
      addedAt: joinedAt,
      status: 'waiting',
    });
    data.waitingPatients = getWaitingPatients(data).length;
    if (!Array.isArray(data.patientEvents)) data.patientEvents = [];
    data.patientEvents.push({ type: 'joined', at: joinedAt });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    sessionStorage.setItem(PATIENT_SESSION_KEY, JSON.stringify({
      clinicMobileNumber: data.mobileNumber,
      patientId: patients[patients.length - 1].id,
    }));

    joinForm.classList.add('hidden');
    confirmation.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = 'You have joined the queue';
    const token = document.createElement('p');
    token.textContent = `Your token number is ${tokenNumber}.`;
    const patient = document.createElement('p');
    patient.textContent = `Name: ${name}`;
    const queueMessage = `You have joined ${data.clinicName || 'the clinic'} queue. Your token number is ${tokenNumber}.`;
    const sms = document.createElement('p');
    sms.textContent = `SMS message preview: ${queueMessage}`;
    const whatsapp = document.createElement('p');
    whatsapp.textContent = `WhatsApp message preview: ${queueMessage}`;
    confirmation.append(heading, token, patient, sms, whatsapp);
    confirmation.classList.remove('hidden');
    setStatus('Your details were added to the clinic queue.', 'success');
    updatePage();
  } catch (error) {
    setStatus(error.message || 'Could not join the queue. Please try again.', 'error');
  }
});

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) updatePage();
});

window.setInterval(updatePage, 5000);
updatePage();
