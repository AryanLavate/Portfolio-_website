import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import {
  getContactSendErrorResponse,
  getOtpSendErrorResponse,
  isResendConfigured,
  logResendBoot,
  logResendError,
  maskEmail,
  sendContactEmail,
  sendOtpEmail,
} from "./mail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const contactUiDir = path.join(rootDir, "contact-ui");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (process.env.TRUST_PROXY === "1" || process.env.RENDER === "true") {
  app.set("trust proxy", 1);
}

/** Vercel / other static hosts call the API on Render — browsers require CORS. */
function isBuiltInAllowedOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const { protocol, hostname } = url;
  if (protocol !== "https:") return false;
  return (
    hostname.endsWith(".vercel.app") ||
    hostname.endsWith(".onrender.com") ||
    hostname === "vercel.app" ||
    hostname === "onrender.com"
  );
}

function getExtraCorsOrigins() {
  return (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isBuiltInAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      const extras = getExtraCorsOrigins();
      if (extras.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 86_400,
  })
);

app.use(express.json({ limit: "64kb" }));

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS =
  Number(process.env.OTP_RESEND_SECONDS || 30) * 1000;
const VERIFIED_TOKEN_TTL_MS = 60 * 60 * 1000;

function getVerificationSecret() {
  const s = process.env.VERIFICATION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[auth] Set VERIFICATION_SECRET (16+ chars) in production."
    );
  }
  return "dev-only-change-me";
}

function getOtpPepper() {
  return getVerificationSecret();
}

/** @type {Map<string, { otpHash: string, expiresAt: number, consumed: boolean, lastSentAt: number }>} */
const otpByEmail = new Map();

/** @type {Map<string, { count: number, resetAt: number }>} */
const sendOtpByEmail = new Map();

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function pruneMaps() {
  const now = Date.now();
  for (const [k, v] of otpByEmail) {
    if (v.expiresAt < now - OTP_TTL_MS) otpByEmail.delete(k);
  }
  for (const [k, v] of sendOtpByEmail) {
    if (v.resetAt < now) sendOtpByEmail.delete(k);
  }
}

setInterval(pruneMaps, 60 * 1000).unref();

function hashOtp(email, otp) {
  return crypto
    .createHmac("sha256", getOtpPepper())
    .update(`${email}:${otp}`)
    .digest("hex");
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function signContactToken(email) {
  const exp = Date.now() + VERIFIED_TOKEN_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({ email, exp, typ: "contact" }),
    "utf8"
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getVerificationSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function verifyContactToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const i = token.lastIndexOf(".");
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = crypto
    .createHmac("sha256", getVerificationSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (data.typ !== "contact" || typeof data.email !== "string") return null;
  if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
  return { email: normalizeEmail(data.email) };
}

const sendOtpIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SEND_OTP_IP_PER_HOUR) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Try again later." },
});

const verifyOtpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_VERIFY_OTP_IP_PER_15M) || 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many verification attempts. Try later." },
});

const contactIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CONTACT_IP_PER_HOUR) || 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many messages sent. Try again later." },
});

function emailSendBudgetKey(email) {
  return normalizeEmail(email);
}

function peekEmailSendBudget(email) {
  const key = emailSendBudgetKey(email);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = Number(process.env.RATE_LIMIT_SEND_OTP_EMAIL_PER_HOUR) || 8;
  const row = sendOtpByEmail.get(key);
  if (!row || row.resetAt < now) return { ok: true };
  if (row.count >= max) {
    const retryAfterSec = Math.ceil((row.resetAt - now) / 1000);
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

function incrementEmailSendBudget(email) {
  const key = emailSendBudgetKey(email);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  let row = sendOtpByEmail.get(key);
  if (!row || row.resetAt < now) {
    row = { count: 0, resetAt: now + windowMs };
  }
  row.count += 1;
  sendOtpByEmail.set(key, row);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function handleSendOtp(req, res) {
  const requestId = crypto.randomBytes(4).toString("hex");
  const logPrefix = `[send-otp:${requestId}]`;

  try {
    const raw = req.body?.email;
    const email = normalizeEmail(raw);

    console.info(`${logPrefix} Request received for ${maskEmail(email)}`);

    if (!email || !emailRe.test(email)) {
      console.warn(`${logPrefix} Invalid email`);
      return res.status(400).json({
        ok: false,
        error: "Please enter a valid email address.",
      });
    }

    const budget = peekEmailSendBudget(email);
    if (!budget.ok) {
      console.warn(`${logPrefix} Per-email rate limit`);
      return res.status(429).json({
        ok: false,
        error: "Too many OTP emails for this address. Try again later.",
        retryAfterSec: budget.retryAfterSec,
      });
    }

    if (!isResendConfigured()) {
      console.error(
        `${logPrefix} RESEND_API_KEY missing or invalid (expected re_… key from Resend)`
      );
      return res.status(503).json({
        ok: false,
        error:
          "Email is not configured on the server. Set RESEND_API_KEY on the server.",
      });
    }

    const now = Date.now();
    const existing = otpByEmail.get(email);
    if (
      existing &&
      !existing.consumed &&
      now <= existing.expiresAt &&
      now - existing.lastSentAt < RESEND_COOLDOWN_MS
    ) {
      const waitMs = RESEND_COOLDOWN_MS - (now - existing.lastSentAt);
      console.info(`${logPrefix} OTP resend cooldown active`);
      return res.status(429).json({
        ok: false,
        error: "Please wait before requesting another code.",
        retryAfterSec: Math.ceil(waitMs / 1000),
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = hashOtp(email, otp);
    const expiresAt = now + OTP_TTL_MS;

    otpByEmail.set(email, {
      otpHash,
      expiresAt,
      consumed: false,
      lastSentAt: now,
    });

    console.info(`${logPrefix} Sending OTP via Resend API...`);

    await sendOtpEmail(email, otp);

    incrementEmailSendBudget(email);

    console.info(`${logPrefix} OTP sent successfully to ${maskEmail(email)}`);

    return res.json({
      ok: true,
      message: "OTP sent. Check your inbox.",
      resendAfterSec: Math.ceil(RESEND_COOLDOWN_MS / 1000),
    });
  } catch (err) {
    console.warn(`${logPrefix} OTP delivery failed`);

    const email = normalizeEmail(req.body?.email);
    if (email) otpByEmail.delete(email);

    logResendError(`${logPrefix} Resend`, err);

    const { status, error } = getOtpSendErrorResponse(err);
    return res.status(status).json({ ok: false, error });
  }
}

async function handleVerifyOtp(req, res) {
  const email = normalizeEmail(req.body?.email);
  const otpRaw = req.body?.otp;
  const otp =
    typeof otpRaw === "string"
      ? otpRaw.replace(/\D/g, "").slice(0, 6)
      : String(otpRaw ?? "").replace(/\D/g, "").slice(0, 6);

  if (!email || !emailRe.test(email)) {
    return res.status(400).json({
      ok: false,
      error: "Please enter a valid email address.",
    });
  }

  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({
      ok: false,
      error: "Enter the 6-digit code from your email.",
    });
  }

  const row = otpByEmail.get(email);
  if (!row || row.consumed) {
    return res.status(400).json({
      ok: false,
      error: "No active code for this email. Request a new OTP.",
    });
  }

  if (Date.now() > row.expiresAt) {
    otpByEmail.delete(email);
    return res.status(400).json({
      ok: false,
      error: "This code has expired. Request a new OTP.",
      code: "OTP_EXPIRED",
    });
  }

  const tryHash = hashOtp(email, otp);
  if (!timingSafeEqualHex(row.otpHash, tryHash)) {
    return res.status(400).json({
      ok: false,
      error: "Incorrect code. Try again or request a new OTP.",
    });
  }

  row.consumed = true;
  otpByEmail.delete(email);

  const verificationToken = signContactToken(email);

  return res.json({
    ok: true,
    message: "Email verified.",
    verificationToken,
  });
}

app.post("/api/send-otp", sendOtpIpLimiter, handleSendOtp);
app.post("/send-otp", sendOtpIpLimiter, handleSendOtp);

app.post("/api/verify-otp", verifyOtpIpLimiter, handleVerifyOtp);
app.post("/verify-otp", verifyOtpIpLimiter, handleVerifyOtp);

async function handleContact(req, res) {
  const { name, email, message, verificationToken } = req.body || {};

  const nameStr = typeof name === "string" ? name.trim() : "";
  const emailStr = normalizeEmail(email);
  const messageStr = typeof message === "string" ? message.trim() : "";
  const tokenStr =
    typeof verificationToken === "string" ? verificationToken.trim() : "";

  if (!nameStr || !emailStr || !messageStr) {
    return res.status(400).json({
      ok: false,
      error: "Please fill in name, email, and message.",
    });
  }

  if (!emailRe.test(emailStr)) {
    return res.status(400).json({
      ok: false,
      error: "Please enter a valid email address.",
    });
  }

  const verified = verifyContactToken(tokenStr);
  if (!verified || verified.email !== emailStr) {
    return res.status(403).json({
      ok: false,
      error: "Please verify your email before sending a message.",
    });
  }

  const to = process.env.MAIL_TO?.trim();

  if (!to || !isResendConfigured()) {
    console.error("[contact] MAIL_TO or RESEND_API_KEY not configured.");
    return res.status(503).json({
      ok: false,
      error: "Email is not configured on the server. Try again later.",
    });
  }

  const subject = `Portfolio contact from ${nameStr}`;

  try {
    await sendContactEmail({
      to,
      replyTo: emailStr,
      subject,
      text: `From: ${nameStr} <${emailStr}>\n\n${messageStr}`,
      html: `<p><strong>From:</strong> ${escapeHtml(nameStr)} &lt;${escapeHtml(
        emailStr
      )}&gt;</p><p>${escapeHtml(messageStr).replace(/\n/g, "<br>")}</p>`,
    });
  } catch (err) {
    logResendError("[contact] Resend", err);
    const { status, error } = getContactSendErrorResponse(err);
    return res.status(status).json({
      ok: false,
      error,
    });
  }

  return res.json({ ok: true, message: "Thanks — your message was sent." });
}

app.post("/api/contact", contactIpLimiter, handleContact);
app.post("/contact", contactIpLimiter, handleContact);

app.use("/contact-ui", express.static(contactUiDir));
app.use(express.static(rootDir));

app.listen(PORT, () => {
  console.log(`Portfolio server listening on port ${PORT}`);
  console.log(
    `[boot] NODE_ENV=${process.env.NODE_ENV || "development"} RENDER=${process.env.RENDER || "false"} trust_proxy=${app.get("trust proxy")}`
  );
  logResendBoot();
});
