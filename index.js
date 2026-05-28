'use strict';

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const crypto     = require('crypto');
const { Resend } = require('resend');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT               = process.env.PORT || 3000;
const RESEND_API_KEY     = process.env.RESEND_API_KEY || '';
const MAIL_FROM          = process.env.MAIL_FROM || 'onboarding@resend.dev';
const MAIL_TO            = process.env.MAIL_TO   || '';
const VERIFICATION_SECRET= process.env.VERIFICATION_SECRET || 'change-me-in-production';
const CORS_ORIGIN        = process.env.CORS_ORIGIN || '*';
const TRUST_PROXY        = process.env.TRUST_PROXY === '1';

if (!RESEND_API_KEY) console.warn('[warn] RESEND_API_KEY not set — emails will fail');
if (!MAIL_TO)        console.warn('[warn] MAIL_TO not set — contact emails have no destination');

const resend = new Resend(RESEND_API_KEY);

// ─── In-memory OTP store  (fine for a portfolio; resets on server restart) ───
// Map<email, { otp, expiresAt }>
const otpStore = new Map();

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function makeToken(email) {
  const payload = `${email}:${Date.now()}:${VERIFICATION_SECRET}`;
  return crypto.createHmac('sha256', VERIFICATION_SECRET).update(payload).digest('hex');
}

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();

if (TRUST_PROXY) app.set('trust proxy', 1);

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// ─── Rate limiters ────────────────────────────────────────────────────────────
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 5,
  message: { error: 'Too many OTP requests. Please wait 10 minutes.' },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many messages sent. Please try again later.' },
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'portfolio-api' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── POST /api/send-otp ───────────────────────────────────────────────────────
// Body: { email: string }
// Sends a 6-digit OTP to the provided email address.
app.post(['/api/send-otp', '/send-otp'], otpLimiter, async (req, res) => {
  const { email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const otp       = generateOtp();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  otpStore.set(email.toLowerCase(), { otp, expiresAt });

  try {
    await resend.emails.send({
      from: MAIL_FROM,
      to:   email,
      subject: 'Your verification code',
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto">
          <h2 style="margin-bottom:8px">Verify your email</h2>
          <p style="color:#555">Enter this code on the contact form:</p>
          <p style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111;margin:16px 0">${otp}</p>
          <p style="color:#999;font-size:13px">The code expires in 10 minutes. If you didn't request this, ignore this email.</p>
        </div>
      `,
    });

    return res.json({ success: true, message: 'OTP sent.' });
  } catch (err) {
    console.error('[send-otp] Resend error:', err?.message);
    return res.status(502).json({ error: 'Failed to send email. Please try again.' });
  }
});

// ─── POST /api/verify-otp ─────────────────────────────────────────────────────
// Body: { email, otp }
// Returns a short-lived verificationToken on success.
app.post(['/api/verify-otp', '/verify-otp'], async (req, res) => {
  const { email, otp } = req.body || {};

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required.' });
  }

  const key    = email.toLowerCase();
  const stored = otpStore.get(key);

  if (!stored) {
    return res.status(400).json({ error: 'No OTP found for this email. Please request a new one.' });
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (stored.otp !== String(otp).trim()) {
    return res.status(400).json({ error: 'Incorrect code. Please try again.' });
  }

  otpStore.delete(key); // single-use
  const verificationToken = makeToken(email);

  return res.json({ success: true, verificationToken });
});

// ─── POST /api/contact ────────────────────────────────────────────────────────
// Body: { name, email, message, verificationToken }
// Sends the contact message to MAIL_TO.
app.post(['/api/contact', '/contact'], contactLimiter, async (req, res) => {
  const { name, email, message, verificationToken } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  if (!verificationToken) {
    return res.status(400).json({ error: 'Email verification is required before sending.' });
  }

  if (!MAIL_TO) {
    console.error('[contact] MAIL_TO not configured');
    return res.status(500).json({ error: 'Server configuration error. Please try again later.' });
  }

  try {
    await resend.emails.send({
      from:     MAIL_FROM,
      to:       MAIL_TO,
      replyTo:  email,
      subject:  `Portfolio contact from ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="margin-bottom:4px">New contact message</h2>
          <p style="color:#555;margin-top:0">From your portfolio contact form</p>
          <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
            <tr>
              <td style="padding:8px;background:#f5f5f5;font-weight:600;width:80px">Name</td>
              <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(name)}</td>
            </tr>
            <tr>
              <td style="padding:8px;background:#f5f5f5;font-weight:600">Email</td>
              <td style="padding:8px;border-bottom:1px solid #eee">
                <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>
              </td>
            </tr>
          </table>
          <div style="background:#fafafa;border-left:3px solid #111;padding:12px 16px;white-space:pre-wrap;font-size:15px">
${escapeHtml(message)}
          </div>
          <p style="color:#aaa;font-size:12px;margin-top:24px">Sent via portfolio contact form · Reply-To is set to the sender's address</p>
        </div>
      `,
    });

    return res.json({ success: true, message: 'Message sent!' });
  } catch (err) {
    console.error('[contact] Resend error:', err?.message);
    return res.status(502).json({ error: 'Failed to send message. Please try again.' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[portfolio-api] listening on port ${PORT}`);
});
