import dns from "node:dns";
import nodemailer from "nodemailer";

const LOG = "[mail]";

/** Prefer IPv4 — Render often has broken or unrouted IPv6 to Gmail. */
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

export function getMailEnv() {
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = normalizeAppPassword(process.env.SMTP_PASS);
  const from = String(process.env.MAIL_FROM || user).trim();
  return { user, pass, from };
}

export function isMailConfigured() {
  const { user, pass, from } = getMailEnv();
  return Boolean(user && pass && from);
}

let transporterInstance = null;

/**
 * Gmail SMTP over SSL (465). Forces IPv4 via `family: 4` and custom `lookup`.
 */
export function getTransporter() {
  if (transporterInstance) return transporterInstance;

  const { user, pass } = getMailEnv();
  if (!user || !pass) {
    console.warn(`${LOG} SMTP_USER or SMTP_PASS missing — transporter not created.`);
    return null;
  }

  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE !== "false";

  transporterInstance = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    family: 4,
    lookup: ipv4Lookup,
    connectionTimeout: 25_000,
    greetingTimeout: 15_000,
    socketTimeout: 25_000,
    tls: {
      minVersion: "TLSv1.2",
      servername: host,
    },
  });

  console.info(
    `${LOG} Transporter created: host=${host} port=${port} secure=${secure} family=4 user=${user}`
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

/** Call once at startup on Render to surface SMTP misconfiguration early. */
export async function verifyTransporterOnStartup() {
  const transporter = getTransporter();
  if (!transporter) {
    console.error(`${LOG} Startup verify skipped — SMTP not configured.`);
    return false;
  }

  try {
    console.info(`${LOG} Verifying SMTP connection (IPv4)...`);
    await transporter.verify();
    console.info(`${LOG} SMTP connection verified.`);
    return true;
  } catch (err) {
    logSmtpError("Startup verify", err);
    return false;
  }
}
