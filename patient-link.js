const patientJoinLink = document.getElementById('patientJoinLink');
const copyPatientLinkBtn = document.getElementById('copyPatientLinkBtn');
const patientLinkMessage = document.getElementById('patientLinkMessage');
const patientQrCode = document.getElementById('patientQrCode');
const patientQrMessage = document.getElementById('patientQrMessage');

if (patientJoinLink && copyPatientLinkBtn && patientLinkMessage && patientQrCode && patientQrMessage) {
  const patientUrl = new URL('patient.html', window.location.href);
  patientJoinLink.href = patientUrl.href;
  patientJoinLink.textContent = patientUrl.href;

  copyPatientLinkBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(patientUrl.href);
      patientLinkMessage.textContent = 'Patient link copied.';
      patientLinkMessage.className = 'status-text success';
    } catch (error) {
      patientLinkMessage.textContent = 'Could not copy the link. Select and copy it from the link above.';
      patientLinkMessage.className = 'status-text error';
    }
  });

  if (typeof QRCode === 'undefined') {
    patientQrMessage.textContent = 'QR code could not load. The patient link above is still available.';
    patientQrMessage.className = 'status-text error';
  } else {
    try {
      new QRCode(patientQrCode, {
        text: patientUrl.href,
        width: 192,
        height: 192,
        colorDark: '#1f2a37',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      patientQrMessage.textContent = 'Scan to open patient sign-up.';
      patientQrMessage.className = 'status-text';
    } catch (error) {
      patientQrMessage.textContent = 'QR code could not be generated. The patient link above is still available.';
      patientQrMessage.className = 'status-text error';
    }
  }
}
