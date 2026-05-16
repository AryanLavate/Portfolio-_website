import { Resend } from "resend";

const LOG = "[resend]";

/** Matches quickstart: `new Resend(process.env.RESEND_API_KEY)` — one client per process. */
let resendSingleton = null;

function getResend() {
  const key = String(process.env.RESEND_API_KEY ?? "").trim();
  if (!key) return null;
  if (!resendSingleton) {
    resendSingleton = new Resend(key);
  }
  return resendSingleton;
}

/**
 * Render: set `MAIL_FROM` to a Resend-verified sender (or `onboarding@resend.dev` for tests).
 * `RESEND_FROM` is accepted for backward compatibility only.
 */
export function getMailFrom() {
  return String(
    process.env.MAIL_FROM || process.env.RESEND_FROM || "onboarding@resend.dev"
  ).trim();
}

export function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at < 2) return "***";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

export function isResendConfigured() {
  const key = String(process.env.RESEND_API_KEY ?? "").trim();
  return key.length > 0 && key.startsWith("re_");
}

export function logResendError(context, err) {
  const message = err?.message ?? String(err);
  const name = err?.name;
  const statusCode = err?.statusCode ?? err?.status;
  const code = err?.code;
  console.error(`${LOG} ${context}:`, { message, name, statusCode, code });
  if (process.env.NODE_ENV !== "production" && err?.stack) {
    console.error(err.stack);
  }
}

/**
 * Map Resend failures to HTTP + safe client message.
 * Avoid broad `message.includes("api")` checks that mislabel transport errors as "not configured".
 */
export function getOtpSendErrorResponse(err) {
  if (err?.code === "MISSING_API_KEY") {
    return {
      status: 503,
      error:
        "Email is not configured on the server. Try again later.",
    };
  }

  const name = err?.name;

  if (name === "missing_api_key" || name === "invalid_api_Key" || err?.statusCode === 401) {
    return {
      status: 503,
      error:
        "Email service authentication failed. Verify RESEND_API_KEY in server environment.",
    };
  }

  if (name === "invalid_from_address" || name === "validation_error") {
    return {
      status: 503,
      error:
        "Could not send the email. MAIL_FROM must be a sender verified in your Resend account.",
    };
  }

  if (name === "rate_limit_exceeded" || err?.statusCode === 429) {
    return {
      status: 429,
      error: "Too many emails sent. Try again in a few minutes.",
    };
  }

  if (name === "invalid_access") {
    return {
      status: 503,
      error:
        "Email service rejected the request. Check Resend API key permissions.",
    };
  }

  return {
    status: 500,
    error: "Could not send the email. Please try again later.",
  };
}

export function getContactSendErrorResponse(err) {
  return getOtpSendErrorResponse(err);
}

/** @param {{ message: string; name: string }} error */
function throwFromResendError(error) {
  const e = new Error(error.message || "Resend API error");
  e.name = error.name || "ResendError";
  if (
    error.name === "missing_api_key" ||
    error.name === "invalid_api_Key" ||
    error.name === "invalid_access"
  ) {
    e.statusCode = 401;
  }
  if (
    error.name === "invalid_from_address" ||
    error.name === "validation_error"
  ) {
    e.statusCode = 403;
  }
  if (error.name === "rate_limit_exceeded") {
    e.statusCode = 429;
  }
  throw e;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sends OTP via Resend HTTP API only (no SMTP).
 */
export async function sendOtpEmail(email, otp) {
  const resend = getResend();
  if (!resend) {
    const err = new Error("RESEND_API_KEY is not configured");
    err.code = "MISSING_API_KEY";
    throw err;
  }

  const from = getMailFrom();

  console.info(`${LOG} OTP send`, {
    to: maskEmail(email),
    from,
  });

  const { data, error } = await resend.emails.send({
    from,
    to: email,
    subject: "Your OTP Code",
    text: `Your verification OTP is: ${otp}\n\nThis code expires in 5 minutes.`,
    html: `<h1 style="font-family:system-ui;font-size:2rem;letter-spacing:0.2em;">${escapeHtml(
      otp
    )}</h1><p>This code expires in 5 minutes.</p>`,
  });

  if (error) {
    throwFromResendError(error);
  }

  console.info(`${LOG} OTP email accepted by Resend`, {
    id: data?.id,
    to: maskEmail(email),
  });

  return data ?? {};
}

export async function sendContactEmail({
  to,
  replyTo,
  subject,
  text,
  html,
}) {
  const resend = getResend();
  if (!resend) {
    const err = new Error("RESEND_API_KEY is not configured");
    err.code = "MISSING_API_KEY";
    throw err;
  }

  const from = getMailFrom();

  const { data, error } = await resend.emails.send({
    from,
    to,
    replyTo,
    subject,
    text,
    html,
  });

  if (error) {
    throwFromResendError(error);
  }

  console.info(`${LOG} contact email accepted`, { id: data?.id, to });
  return data ?? {};
}

export function logResendBoot() {
  const key = String(process.env.RESEND_API_KEY ?? "").trim();
  if (!key) {
    console.warn(`${LOG} RESEND_API_KEY is not set — OTP and contact email will fail.`);
    return;
  }

  if (!key.startsWith("re_")) {
    console.warn(
      `${LOG} RESEND_API_KEY should usually start with "re_" — double-check your Render secret.`
    );
  }

  const mailTo = String(process.env.MAIL_TO ?? "").trim();
  console.info(`${LOG} Resend email delivery`, {
    mailFrom: getMailFrom(),
    mailToSet: Boolean(mailTo),
    apiKeyLooksValid: key.startsWith("re_") && key.length > 12,
  });

  if (!mailTo) {
    console.warn(
      `${LOG} MAIL_TO is not set — contact form notifications have no destination.`
    );
  }
}
