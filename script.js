const receptionToggle = document.getElementById('receptionToggle');
const receptionFields = document.getElementById('receptionFields');
const form = document.getElementById('clinicQueueForm');
const sessionAlert = document.getElementById('sessionAlert');const reAuthBtn = document.getElementById('reAuthBtn');
const STORAGE_KEY = 'clinicQueueData';
const AUTH_KEY = 'clinicAuthState';
const mobileNumberInput = document.getElementById('mobileNumber');
const registrationOtpInput = document.getElementById('registrationOtp');
const registrationStatus = document.getElementById('registrationStatus');
const sendRegistrationOtpBtn = document.getElementById('sendRegistrationOtpBtn');
const firebaseConfig = window.firebaseConfig || {};
const TAB_ID = sessionStorage.getItem('clinicTabId') || `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
sessionStorage.setItem('clinicTabId', TAB_ID);

let confirmationResult = null;
let recaptchaVerifier = null;
let pendingRegistrationOtp = null;

function getAuthState() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function showRegistrationStatus(message, type = '') {
  registrationStatus.textContent = message;
  registrationStatus.className = 'status-text';
  if (type) registrationStatus.classList.add(type);
}

function hasFirebaseConfig() {
  return Object.values(firebaseConfig).every((value) => value && !String(value).startsWith('YOUR_'));
}

function ensureFirebaseAuth() {
  if (!window.firebase) return null;
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  return firebase.auth();
}

function normalizePhoneNumber(value) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `+91${digits.slice(1)}` : `+${digits}`;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendRegistrationOtp() {
  const mobileValue = mobileNumberInput.value.trim();
  const digitCount = mobileValue.replace(/\D/g, '').length;
  const phoneNumber = normalizePhoneNumber(mobileValue);
  if (digitCount < 10 || digitCount > 15 || !form.elements.namedItem('email').validity.valid) {
    showRegistrationStatus('Enter a valid mobile number and email address first.', 'error');
    return;
  }

  sendRegistrationOtpBtn.disabled = true;
  try {
    if (hasFirebaseConfig()) {
      try {
        const auth = ensureFirebaseAuth();
        if (!auth) throw new Error('Firebase Authentication is unavailable.');
        if (!recaptchaVerifier) {
          recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {}, auth);
        }
        confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, recaptchaVerifier);
        pendingRegistrationOtp = { phoneNumber, createdAt: Date.now(), firebaseMode: true };
        registrationOtpInput.value = '';
        showRegistrationStatus('OTP sent via Firebase. Enter the code from your phone to continue.', 'success');
        return;
      } catch (error) {
        console.error('Firebase registration OTP failed:', error);
        if (recaptchaVerifier) {
          recaptchaVerifier.clear();
          recaptchaVerifier = null;
        }
        confirmationResult = null;
        showRegistrationStatus('Firebase OTP failed. Using demo OTP instead.', 'error');
      }
    }

    const otp = generateOtp();
    pendingRegistrationOtp = { phoneNumber, otp, createdAt: Date.now(), firebaseMode: false };
    registrationOtpInput.value = '';
    showRegistrationStatus(`Demo OTP: ${otp}. Enter it to verify your mobile number.`, 'success');
  } finally {
    sendRegistrationOtpBtn.disabled = false;
  }
}

async function verifyRegistrationOtp() {
  const phoneNumber = normalizePhoneNumber(mobileNumberInput.value.trim());
  if (!pendingRegistrationOtp || pendingRegistrationOtp.phoneNumber !== phoneNumber) {
    showRegistrationStatus('Send a new OTP for the current mobile number.', 'error');
    return false;
  }
  if (Date.now() - pendingRegistrationOtp.createdAt > 5 * 60 * 1000) {
    pendingRegistrationOtp = null;
    confirmationResult = null;
    showRegistrationStatus('OTP expired. Please send a new OTP.', 'error');
    return false;
  }

  const enteredOtp = registrationOtpInput.value.trim();
  if (!/^\d{6}$/.test(enteredOtp)) {
    showRegistrationStatus('Enter the 6-digit OTP sent to your mobile.', 'error');
    return false;
  }

  if (pendingRegistrationOtp.firebaseMode) {
    if (!confirmationResult) {
      showRegistrationStatus('OTP verification is no longer available. Please send a new OTP.', 'error');
      return false;
    }
    try {
      await confirmationResult.confirm(enteredOtp);
    } catch (error) {
      showRegistrationStatus('Invalid OTP. Please enter the correct code.', 'error');
      return false;
    }
  } else if (enteredOtp !== pendingRegistrationOtp.otp) {
    showRegistrationStatus('Invalid OTP. Please enter the correct code.', 'error');
    return false;
  }

  pendingRegistrationOtp = null;
  confirmationResult = null;
  return true;
}

function setSessionAlert(message, type = '') {
  if (!sessionAlert) return;
  sessionAlert.textContent = message;
  sessionAlert.className = 'status-text';
  if (type) {
    sessionAlert.classList.add(type);
  }
  sessionAlert.classList.toggle('hidden', !message);
  if (reAuthBtn) {
    reAuthBtn.classList.toggle('hidden', !message);
  }
}

function unlockSession() {
  localStorage.removeItem(AUTH_KEY);
  form.querySelectorAll('input, button, select').forEach((element) => {
    element.disabled = false;
  });
  setSessionAlert('', '');
}

function guardSession() {
  const auth = getAuthState();
  if (!auth || auth.tabId === TAB_ID) {
    return;
  }

  const isValidSession = Date.now() < Number(auth.expiresAt || 0);
  if (!isValidSession) {
    localStorage.removeItem(AUTH_KEY);
    return;
  }

  setSessionAlert('This page is already active in another tab. Please re-enter your login details to continue.', 'error');
  form.querySelectorAll('input, button, select').forEach((element) => {
    element.disabled = true;
  });
}

function syncReceptionFields() {
  const isEnabled = receptionToggle.checked;
  receptionFields.classList.toggle('hidden', !isEnabled);

  const inputs = receptionFields.querySelectorAll('input');
  inputs.forEach((input) => {
    if (isEnabled) {
      input.setAttribute('required', 'required');
    } else {
      input.value = '';
      input.removeAttribute('required');
    }
  });
}

function serializeFormData() {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  data.receptionEnabled = !!receptionToggle.checked;
  data.queueStatus = 'stopped';
  data.queueStartedAt = null;
  data.queueStoppedAt = new Date().toISOString();
  data.waitingPatients = 0;
  data.patients = [];
  data.patientEvents = [];
  return data;
}

receptionToggle.addEventListener('change', syncReceptionFields);

form.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!pendingRegistrationOtp) {
    showRegistrationStatus('Send and verify a mobile OTP before registering.', 'error');
    return;
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  submitRegistration();
});

async function submitRegistration() {
  const submitButton = form.querySelector('.submit-btn');
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  try {
    if (!await verifyRegistrationOtp()) {
      submitButton.disabled = false;
      return;
    }

    const payload = serializeFormData();
    delete payload.registrationOtp;
    payload.mobileNumber = mobileNumberInput.value.trim();
    payload.email = String(payload.email || '').trim();
    payload.mobileVerified = true;
    payload.mobileVerifiedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    const auth = getAuthState();
    if (auth && auth.tabId !== TAB_ID) {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ ...auth, tabId: TAB_ID, expiresAt: Date.now() + 30 * 60 * 1000 }));
    }

    submitButton.textContent = 'Registered';
    showRegistrationStatus('Mobile verified. Clinic registration saved.', 'success');

    setTimeout(() => {
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      form.reset();
      pendingRegistrationOtp = null;
      confirmationResult = null;
      syncReceptionFields();
    }, 1800);
  } catch (error) {
    showRegistrationStatus(error.message || 'Could not save registration. Please try again.', 'error');
    submitButton.disabled = false;
  }
}

sendRegistrationOtpBtn.addEventListener('click', sendRegistrationOtp);
mobileNumberInput.addEventListener('input', () => {
  pendingRegistrationOtp = null;
  confirmationResult = null;
  registrationOtpInput.value = '';
  showRegistrationStatus('', '');
});
window.addEventListener('storage', (event) => {
  if (event.key === AUTH_KEY) {
    guardSession();
  }
});

if (reAuthBtn) {
  reAuthBtn.addEventListener('click', unlockSession);
}

syncReceptionFields();
guardSession();
