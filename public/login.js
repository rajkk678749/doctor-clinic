const STORAGE_KEY = 'clinicQueueData';
const AUTH_KEY = 'clinicAuthState';
const OTP_KEY = 'clinicPendingOtp';
const savedInfo = document.getElementById('savedInfo');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const loginSessionAlert = document.getElementById('loginSessionAlert');
const loginReAuthBtn = document.getElementById('loginReAuthBtn');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const otpCodeInput = document.getElementById('otpCode');
const loginRoleInput = document.getElementById('loginRole');
const loginNameLabel = document.getElementById('loginNameLabel');
const loginNameInput = document.getElementById('doctorName');
const mobileNumberInput = document.getElementById('mobileNumber');
const TAB_ID = sessionStorage.getItem('clinicTabId') || `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
sessionStorage.setItem('clinicTabId', TAB_ID);

const firebaseConfig = window.firebaseConfig || {};
const apiBaseUrl = window.apiBaseUrl || '';

let confirmationResult = null;
let recaptchaVerifier = null;

function hasFirebaseConfig() {
  return Object.values(firebaseConfig).every((value) => value && !String(value).startsWith('YOUR_'));
}

function ensureFirebaseInstance() {
  if (!window.firebase) return null;

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  return firebase.auth();
}

function normalizePhoneNumber(value) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `+91${digits.slice(1)}` : `+${digits}`;
}

async function sendWithFirebase(phoneNumber) {
  if (!hasFirebaseConfig()) {
    return false;
  }

  const auth = ensureFirebaseInstance();
  if (!auth) {
    return false;
  }

  if (!recaptchaVerifier) {
    recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {}, auth);
  }

  confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, recaptchaVerifier);
  return true;
}

async function verifyWithBackend(payload) {
  if (!apiBaseUrl) {
    return true;
  }

  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Backend login verification failed.');
  }

  return response.json();
}

function loadSavedQueueData() {
  const rawData = localStorage.getItem(STORAGE_KEY);
  if (!rawData) {
    savedInfo.innerHTML = '<p>No saved queue yet.</p><ul><li>Create a queue from the Create Queue tab.</li></ul>';
    savedInfo.classList.remove('hidden');
    return null;
  }

  try {
    const data = JSON.parse(rawData);
    savedInfo.innerHTML = `
      <p>Saved clinic details</p>
      <ul>
        <li>Doctor: ${data.doctorName || 'N/A'}</li>
        <li>Mobile: ${data.mobileNumber || 'N/A'}</li>
        <li>Clinic: ${data.clinicName || 'N/A'}</li>
      </ul>
    `;
    savedInfo.classList.remove('hidden');
    return data;
  } catch (error) {
    savedInfo.innerHTML = '<p>Saved queue data is invalid.</p>';
    savedInfo.classList.remove('hidden');
    return null;
  }
}

function prefillLoginForm(data) {
  if (!data) return;

  updateLoginFields();
}

function updateLoginFields() {
  const data = loadQueueData();
  const isReceptionist = loginRoleInput.value === 'receptionist';
  loginNameLabel.textContent = isReceptionist ? 'Receptionist Name' : 'Doctor Name';
  loginNameInput.placeholder = isReceptionist ? 'Enter your receptionist name' : 'Enter your doctor name';
  loginNameInput.value = isReceptionist
    ? (data?.receptionEnabled ? data.receptionName || '' : '')
    : data?.doctorName || '';
  mobileNumberInput.value = isReceptionist
    ? (data?.receptionEnabled ? data.receptionMobile || '' : '')
    : data?.mobileNumber || '';
}

function loadQueueData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function showMessage(message, type = '') {
  loginStatus.textContent = message;
  loginStatus.className = 'status-text';
  if (type) {
    loginStatus.classList.add(type);
  }
}

function setSessionAlert(message, type = '') {
  if (!loginSessionAlert) return;
  loginSessionAlert.textContent = message;
  loginSessionAlert.className = 'status-text';
  if (type) {
    loginSessionAlert.classList.add(type);
  }
  loginSessionAlert.classList.toggle('hidden', !message);
  if (loginReAuthBtn) {
    loginReAuthBtn.classList.toggle('hidden', !message);
  }
}

function unlockSession() {
  localStorage.removeItem(AUTH_KEY);
  loginForm.querySelectorAll('input, button').forEach((element) => {
    element.disabled = false;
  });
  setSessionAlert('', '');
}

function getAuthState() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch (error) {
    return null;
  }
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

  setSessionAlert('This login page is already active in another tab. Re-enter your details to continue.', 'error');
  loginForm.querySelectorAll('input, button').forEach((element) => {
    element.disabled = true;
  });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtp() {
  const doctorName = loginNameInput.value.trim();
  const mobileNumber = mobileNumberInput.value.trim();
  const role = loginRoleInput.value;

  if (!doctorName || !mobileNumber) {
    showMessage('Please enter both doctor name and mobile number.', 'error');
    return;
  }

  const validation = validateQueueCredentials(doctorName, mobileNumber, role);
  if (!validation.valid) {
    showMessage(validation.message, 'error');
    return;
  }

  const phoneNumber = normalizePhoneNumber(mobileNumber);

  if (hasFirebaseConfig()) {
    try {
      const sent = await sendWithFirebase(phoneNumber);
      if (sent) {
        localStorage.setItem(OTP_KEY, JSON.stringify({
          otp: 'FIREBASE_OTP',
          doctorName,
          mobileNumber,
          role,
          phoneNumber,
          createdAt: Date.now(),
          firebaseMode: true,
        }));
        otpCodeInput.value = '';
        showMessage('OTP sent via Firebase. Enter the code from your phone to continue.', 'success');
        return;
      }
    } catch (error) {
      console.error('Firebase phone auth failed:', error);
      showMessage('Firebase OTP failed. Falling back to demo OTP.', 'error');
    }
  }

  const otp = generateOtp();
  localStorage.setItem(OTP_KEY, JSON.stringify({ otp, doctorName, mobileNumber, role, phoneNumber, createdAt: Date.now(), firebaseMode: false }));
  otpCodeInput.value = '';
  showMessage(`OTP sent to your registered mobile. Demo OTP: ${otp}`, 'success');
}

function validateQueueCredentials(doctorName, mobileNumber, role = 'doctor') {
  const queueData = loadQueueData() || {};

  if (!queueData.doctorName || !queueData.mobileNumber) {
    return { valid: false, message: 'No clinic queue has been created yet. Please create one first.' };
  }

  const isReceptionist = role === 'receptionist';
  const expectedName = isReceptionist ? queueData.receptionName : queueData.doctorName;
  const expectedMobile = isReceptionist ? queueData.receptionMobile : queueData.mobileNumber;
  if (isReceptionist && !queueData.receptionEnabled) {
    return { valid: false, message: 'Reception login is disabled for this clinic.', queueData };
  }
  const valid = Boolean(expectedName && expectedMobile) &&
    doctorName.toLowerCase() === String(expectedName).toLowerCase() &&
    mobileNumber === String(expectedMobile);

  return {
    valid,
    message: valid ? 'Credentials verified. OTP sent successfully.' : 'Invalid login details. Check the name and mobile number for the selected login type.',
    queueData,
    role,
  };
}

const savedQueueData = loadSavedQueueData();
prefillLoginForm(savedQueueData);

sendOtpBtn.addEventListener('click', sendOtp);
loginRoleInput.addEventListener('change', () => {
  updateLoginFields();
  otpCodeInput.value = '';
  localStorage.removeItem(OTP_KEY);
  showMessage('', '');
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const doctorName = loginNameInput.value.trim();
  const mobileNumber = mobileNumberInput.value.trim();
  const role = loginRoleInput.value;
  const otpValue = document.getElementById('otpCode').value.trim();

  if (!doctorName || !mobileNumber) {
    showMessage('Please enter both doctor name and mobile number.', 'error');
    return;
  }

  const validation = validateQueueCredentials(doctorName, mobileNumber, role);
  if (!validation.valid) {
    showMessage(validation.message, 'error');
    return;
  }

  const pendingOtp = JSON.parse(localStorage.getItem(OTP_KEY) || 'null');
  if (!pendingOtp ||
    pendingOtp.doctorName.toLowerCase() !== doctorName.toLowerCase() ||
    pendingOtp.mobileNumber !== mobileNumber ||
    pendingOtp.role !== role) {
    showMessage('Please send an OTP first.', 'error');
    return;
  }

  let firebaseUser = null;

  if (pendingOtp.firebaseMode && confirmationResult) {
    try {
      const userCredential = await confirmationResult.confirm(otpValue);
      if (!userCredential || !userCredential.user) {
        throw new Error('Firebase confirmation failed.');
      }
      firebaseUser = userCredential.user;
    } catch (error) {
      showMessage('Invalid OTP. Please re-enter the correct OTP.', 'error');
      return;
    }
  } else if (otpValue !== String(pendingOtp.otp)) {
    showMessage('Invalid OTP. Please re-enter the correct OTP.', 'error');
    return;
  }

  try {
    const loginPayload = {
      doctorName,
      mobileNumber,
      role,
      clinicName: validation.queueData.clinicName || '',
      phoneNumber: pendingOtp.phoneNumber || normalizePhoneNumber(mobileNumber),
      uid: firebaseUser ? firebaseUser.uid : null,
      otp: otpValue,
    };

    await verifyWithBackend(loginPayload);
  } catch (error) {
    showMessage(error.message || 'Backend verification failed. Please try again.', 'error');
    return;
  }

  const authState = {
    doctorName: validation.queueData.doctorName,
    receptionistName: role === 'receptionist' ? doctorName : validation.queueData.receptionName || '',
    mobileNumber,
    role,
    tabId: TAB_ID,
    expiresAt: Date.now() + 30 * 60 * 1000,
    clinicName: validation.queueData.clinicName || '',
    clinicMobileNumber: validation.queueData.mobileNumber,
  };

  localStorage.setItem(AUTH_KEY, JSON.stringify(authState));
  localStorage.setItem(
    'clinicLastLogin',
    JSON.stringify({
      doctorName,
      receptionistName: role === 'receptionist' ? doctorName : '',
      mobileNumber,
      clinicName: validation.queueData.clinicName || '',
      loggedAt: new Date().toISOString(),
    })
  );

  window.location.assign(role === 'receptionist' ? 'reception-dashboard.html' : 'dashboard.html');
});

window.addEventListener('storage', (event) => {
  if (event.key === AUTH_KEY) {
    guardSession();
  }
});

if (loginReAuthBtn) {
  loginReAuthBtn.addEventListener('click', unlockSession);
}

guardSession();
