import dns from "node:dns";
import nodemailer from "nodemailer";

const LOG = "[mail]";

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const SMTP_TIMEOUT_MS = 10_000;

/** DNS-level IPv4 — complements `family: 4` on the socket (fixes Render IPv6 egress). */
function ipv4Lookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, family: 4 }, callback);
}

function normalizeAppPassword(pass) {
  return String(pass || "")
    .replace(/\s+/g, "")
    .trim();
}

export function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at < 2) return "***";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

/**
 * EMAIL_USER / EMAIL_PASS are primary (Render).
 * SMTP_USER / SMTP_PASS kept for backward compatibility.
 */
export function getMailEnv() {
  const user = String(
    process.env.EMAIL_USER || process.env.SMTP_USER || ""
  ).trim();
  const pass = normalizeAppPassword(
    process.env.EMAIL_PASS || process.env.SMTP_PASS
  );
  const from = String(
    process.env.MAIL_FROM || process.env.EMAIL_USER || user
  ).trim();
  return { user, pass, from };
}

export function isMailConfigured() {
  const { user, pass, from } = getMailEnv();
  return Boolean(user && pass && from);
}

let transporterInstance = null;

/**
 * Explicit Gmail SMTP (no `service: "gmail"`). IPv4-only for Render.
 */
export function getTransporter() {
  if (transporterInstance) return transporterInstance;

  const { user, pass } = getMailEnv();
  if (!user || !pass) {
    console.warn(
      `${LOG} EMAIL_USER/EMAIL_PASS (or SMTP_USER/SMTP_PASS) missing — transporter not created.`
    );
    return null;
  }

  transporterInstance = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    family: 4,
    lookup: ipv4Lookup,
    auth: {
      user,
      pass,
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    tls: {
      minVersion: "TLSv1.2",
      servername: SMTP_HOST,
    },
  });

  console.info(
    `${LOG} Transporter ready: ${SMTP_HOST}:${SMTP_PORT} secure=true family=4 timeouts=${SMTP_TIMEOUT_MS}ms user=${user}`
  );

  return transporterInstance;
}

export function logSmtpError(context, err) {
  const details = {
    message: err?.message,
    code: err?.code,
    errno: err?.errno,
    syscall: err?.syscall,
    address: err?.address,
    port: err?.port,
    response: err?.response,
    responseCode: err?.responseCode,
    command: err?.command,
  };
  console.error(`${LOG} ${context} failed:`, details);
  if (process.env.NODE_ENV !== "production" && err?.stack) {
    console.error(err.stack);
  }
}

export async function verifyTransporterOnStartup() {
  const transporter = getTransporter();
  if (!transporter) {
    console.error(`${LOG} Startup verify skipped — email env not configured.`);
    return false;
  }

  try {
    console.info(`${LOG} Verifying Gmail SMTP over IPv4...`);
    await transporter.verify();
    console.info(`${LOG} SMTP verify OK.`);
    return true;
  } catch (err) {
    logSmtpError("Startup verify", err);
    return false;
  }
}
