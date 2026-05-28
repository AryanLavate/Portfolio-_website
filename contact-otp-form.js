/**
 * contact-otp-form.js
 *
 * Handles the 3-step OTP contact form:
 *   1. User enters email → clicks "Verify email" → OTP sent
 *   2. User enters 6-digit OTP → clicks "Verify email" → gets verificationToken
 *   3. User fills name + message → clicks "Send message" → message delivered
 *
 * The API base URL is read from:
 *   window.PORTFOLIO_API  (set it in a <script> tag BEFORE this file loads)
 *   Fallback: empty string (same origin — useful when server also serves the HTML)
 *
 * All form elements are selected by data-* attributes so CSS class names can
 * change freely without breaking the JS.
 */

(function () {
  'use strict';

  // ── API base (set window.PORTFOLIO_API before this script loads) ───────────
  const API = (window.PORTFOLIO_API || '').replace(/\/$/, '');

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const form          = document.querySelector('[data-contact-otp-form]');
  if (!form) return; // not on the contact page

  const emailInput    = form.querySelector('[data-otp-email]');
  const sendOtpBtn    = form.querySelector('[data-send-otp]');
  const resendNote    = form.querySelector('[data-resend-note]');

  const otpWrap       = form.querySelector('[data-otp-wrap]');
  const otpDigits     = form.querySelectorAll('[data-otp-digit]');
  const verifyOtpBtn  = form.querySelector('[data-verify-otp]');

  const verifiedBox   = form.querySelector('[data-verified-box]');
  const changeEmailBtn= form.querySelector('[data-change-email]');

  const submitBtn     = form.querySelector('[data-submit-contact]');
  const statusEl      = form.querySelector('[data-form-status]');

  let verificationToken = null;
  let resendTimer       = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showStatus(msg, type = 'error') {
    statusEl.textContent = msg;
    statusEl.className   = `form-status form-status--${type}`;
    statusEl.hidden      = false;
  }

  function clearStatus() {
    statusEl.hidden    = true;
    statusEl.textContent = '';
  }

  function setLoading(btn, loading, originalText) {
    btn.disabled     = loading;
    btn.textContent  = loading ? 'Please wait…' : originalText;
  }

  async function apiFetch(path, body) {
    const res  = await fetch(`${API}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ── OTP digit inputs: auto-advance & backspace ────────────────────────────
  otpDigits.forEach((input, i) => {
    input.addEventListener('input', () => {
      // keep only digits
      input.value = input.value.replace(/\D/g, '').slice(-1);
      if (input.value && i < otpDigits.length - 1) otpDigits[i + 1].focus();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        otpDigits[i - 1].focus();
      }
    });

    // Handle paste on any digit (paste full 6-digit code)
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)
        .getData('text')
        .replace(/\D/g, '')
        .slice(0, 6);
      [...pasted].forEach((ch, j) => {
        if (otpDigits[j]) otpDigits[j].value = ch;
      });
      const next = Math.min(pasted.length, otpDigits.length - 1);
      otpDigits[next].focus();
    });
  });

  function getOtpValue() {
    return [...otpDigits].map(d => d.value).join('');
  }

  function clearOtpInputs() {
    otpDigits.forEach(d => (d.value = ''));
    otpDigits[0]?.focus();
  }

  // ── Resend countdown ──────────────────────────────────────────────────────
  function startResendCountdown(seconds = 60) {
    clearTimeout(resendTimer);
    sendOtpBtn.disabled = true;

    let remaining = seconds;
    resendNote.textContent = `Resend in ${remaining}s`;

    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resendNote.textContent  = '';
        sendOtpBtn.disabled     = false;
        sendOtpBtn.textContent  = 'Resend code';
      } else {
        resendNote.textContent = `Resend in ${remaining}s`;
        resendTimer = setTimeout(tick, 1000);
      }
    };
    resendTimer = setTimeout(tick, 1000);
  }

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  sendOtpBtn.addEventListener('click', async () => {
    clearStatus();
    const email = emailInput.value.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus('Please enter a valid email address.');
      emailInput.focus();
      return;
    }

    setLoading(sendOtpBtn, true, sendOtpBtn.textContent);

    try {
      await apiFetch('/api/send-otp', { email });
      otpWrap.hidden       = false;
      emailInput.readOnly  = true;
      clearOtpInputs();
      startResendCountdown(60);
      showStatus(`A 6-digit code was sent to ${email}`, 'info');
    } catch (err) {
      showStatus(err.message);
    } finally {
      setLoading(sendOtpBtn, false, sendOtpBtn.textContent);
    }
  });

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  verifyOtpBtn.addEventListener('click', async () => {
    clearStatus();
    const email = emailInput.value.trim();
    const otp   = getOtpValue();

    if (otp.length < 6) {
      showStatus('Please enter all 6 digits of the code.');
      return;
    }

    setLoading(verifyOtpBtn, true, 'Verify email');

    try {
      const data = await apiFetch('/api/verify-otp', { email, otp });
      verificationToken       = data.verificationToken;

      // Hide OTP block, show success banner
      otpWrap.hidden          = true;
      verifiedBox.hidden      = false;
      changeEmailBtn.hidden   = false;
      submitBtn.disabled      = false;

      clearTimeout(resendTimer);
      resendNote.textContent  = '';
      clearStatus();
    } catch (err) {
      showStatus(err.message);
      clearOtpInputs();
    } finally {
      setLoading(verifyOtpBtn, false, 'Verify email');
    }
  });

  // ── Change email ──────────────────────────────────────────────────────────
  changeEmailBtn?.addEventListener('click', () => {
    verificationToken       = null;
    verifiedBox.hidden      = true;
    otpWrap.hidden          = true;
    emailInput.readOnly     = false;
    submitBtn.disabled      = true;
    sendOtpBtn.disabled     = false;
    sendOtpBtn.textContent  = 'Verify email';
    resendNote.textContent  = '';
    clearTimeout(resendTimer);
    clearOtpInputs();
    clearStatus();
    emailInput.focus();
  });

  // ── Step 3: Submit contact message ────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();

    if (!verificationToken) {
      showStatus('Please verify your email before sending.');
      return;
    }

    const name    = form.querySelector('[name="name"]')?.value.trim();
    const email   = emailInput.value.trim();
    const message = form.querySelector('[name="message"]')?.value.trim();

    if (!name)    { showStatus('Please enter your name.');    return; }
    if (!message) { showStatus('Please enter your message.'); return; }

    setLoading(submitBtn, true, 'Send message');

    try {
      await apiFetch('/api/contact', { name, email, message, verificationToken });

      // Success state
      form.reset();
      verificationToken     = null;
      verifiedBox.hidden    = true;
      otpWrap.hidden        = true;
      emailInput.readOnly   = false;
      submitBtn.disabled    = true;
      sendOtpBtn.disabled   = false;
      sendOtpBtn.textContent= 'Verify email';
      resendNote.textContent= '';

      showStatus('✓ Message sent! I\'ll get back to you soon.', 'success');
    } catch (err) {
      showStatus(err.message);
    } finally {
      setLoading(submitBtn, false, 'Send message');
    }
  });
})();
