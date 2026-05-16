import { Resend } from "resend";

const LOG = "[resend]";

let resendClient = null;

function getResend() {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

export function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at < 2) return "***";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

export function getResendFrom() {
  return String(
    process.env.RESEND_FROM || "onboarding@resend.dev"
  ).trim();
}

export function isResendConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

export function logResendError(context, err) {
  const message = err?.message ?? String(err);
  const name = err?.name;
  const statusCode = err?.statusCode ?? err?.status;
  console.error(`${LOG} ${context} failed:`, {
    message,
    name,
    statusCode,
  });
  if (process.env.NODE_ENV !== "production" && err?.stack) {
    console.error(err.stack);
  }
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
  throw e;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOtpEmailHtml(otp) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify Your Email</title>
</head>
<body style="margin:0;background:#0b0f14;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8eef7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#121826;border-radius:16px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.45);">
          <tr>
            <td style="padding:28px 28px 8px 28px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;">Portfolio</td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px 28px;font-size:22px;font-weight:650;line-height:1.25;">Email Verification</td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-size:15px;line-height:1.6;color:#c7d2fe;">
              Your one-time code is below. It expires in <strong>5 minutes</strong>.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 28px 28px 28px;">
              <div style="display:inline-block;padding:18px 28px;border-radius:14px;background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid rgba(125,211,252,0.35);font-size:28px;font-weight:700;letter-spacing:0.35em;color:#f8fafc;">
                ${escapeHtml(otp)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;font-size:13px;line-height:1.6;color:#94a3b8;">
              If you did not request this, you can ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends OTP verification email via Resend HTTP API (no SMTP).
 * @param {string} email Recipient address (normalized)
 * @param {string} otp Six-digit code
 * @returns {Promise<{ id?: string }>}
 */
export async function sendOtpEmail(email, otp) {
  const resend = getResend();
  if (!resend) {
    const err = new Error("RESEND_API_KEY is not configured");
    err.code = "MISSING_API_KEY";
    throw err;
  }

  const from = getResendFrom();

  try {
    console.info(`${LOG} Sending OTP to ${maskEmail(email)} from ${from}`);

    const { data, error } = await resend.emails.send({
      from: `Portfolio <${from}>`,
      to: email,
      subject: "Your OTP Code",
      text: `Your verification OTP is: ${otp}\n\nThis code expires in 5 minutes.`,
      html: buildOtpEmailHtml(otp),
    });

    if (error) {
      throwFromResendError(error);
    }

    console.info(`${LOG} OTP email sent`, {
      id: data?.id,
      to: maskEmail(email),
    });

    return data ?? {};
  } catch (err) {
    logResendError("sendOtpEmail", err);
    throw err;
  }
}

/**
 * Contact form notification (replaces previous SMTP sendMail).
 */
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

  const from = getResendFrom();

  try {
    const { data, error } = await resend.emails.send({
      from: `Portfolio site <${from}>`,
      to,
      replyTo,
      subject,
      text,
      html,
    });

    if (error) {
      throwFromResendError(error);
    }

    console.info(`${LOG} Contact email sent`, { id: data?.id, to });
    return data ?? {};
  } catch (err) {
    logResendError("sendContactEmail", err);
    throw err;
  }
}

export function logResendBoot() {
  if (isResendConfigured()) {
    console.info(
      `${LOG} API key loaded (from=${getResendFrom()}). Resend HTTP API — no SMTP.`
    );
  } else {
    console.warn(
      `${LOG} RESEND_API_KEY missing — OTP and contact email will fail until set.`
    );
  }
}
