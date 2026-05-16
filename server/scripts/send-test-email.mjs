/**
 * One-off Resend test (Resend quickstart style).
 * Do not put your API key in this file — use server/.env only.
 *
 * 1. Copy server/.env.example → server/.env
 * 2. Replace re_xxxxxxxxx with your real RESEND_API_KEY
 * 3. Set RESEND_TEST_TO to the inbox you want to hit
 * 4. Run: npm run test:resend
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Resend } from "resend";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const apiKey = String(process.env.RESEND_API_KEY || "").trim();
if (!apiKey || apiKey === "re_xxxxxxxxx" || apiKey === "re_xxxxxxxx") {
  console.error(
    "[test:resend] Set RESEND_API_KEY in server/.env — replace re_xxxxxxxxx with your real key from https://resend.com/api-keys"
  );
  process.exit(1);
}

const to = String(process.env.RESEND_TEST_TO || "").trim();
if (!to) {
  console.error(
    "[test:resend] Set RESEND_TEST_TO in server/.env (recipient email)."
  );
  process.exit(1);
}

const from =
  String(process.env.RESEND_FROM || "").trim() || "onboarding@resend.dev";

const resend = new Resend(apiKey);

try {
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: "Hello World",
    html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
  });

  if (error) {
    console.error("[test:resend] Resend API error:", error);
    process.exit(1);
  }

  console.log("[test:resend] Email sent:", data);
} catch (err) {
  console.error("[test:resend] Failed:", err?.message || err);
  process.exit(1);
}
