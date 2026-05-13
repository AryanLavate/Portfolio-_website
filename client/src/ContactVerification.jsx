import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function apiUrl(path) {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export default function ContactVerification() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpSent, setOtpSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState(null);
  const [resendIn, setResendIn] = useState(0);

  const otpRefs = useRef([]);

  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const resetFlow = useCallback(() => {
    setOtp(["", "", "", "", "", ""]);
    setOtpSent(false);
    setVerified(false);
    setVerificationToken("");
    setResendIn(0);
  }, []);

  const otpString = otp.join("");

  const focusOtpIndex = (i) => {
    const el = otpRefs.current[i];
    if (el) el.focus();
  };

  const handleOtpChange = (index, raw) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      const next = [...otp];
      next[index] = "";
      setOtp(next);
      return;
    }
    const next = [...otp];
    let rest = digits;
    let i = index;
    while (rest && i < 6) {
      next[i] = rest[0];
      rest = rest.slice(1);
      i += 1;
    }
    setOtp(next);
    if (i < 6) focusOtpIndex(i);
    else otpRefs.current[5]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      e.preventDefault();
      focusOtpIndex(index - 1);
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusOtpIndex(index - 1);
    }
    if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      focusOtpIndex(index + 1);
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = [...otp];
    for (let i = 0; i < 6; i += 1) next[i] = text[i] || "";
    setOtp(next);
    const last = Math.min(text.length, 5);
    focusOtpIndex(last);
  };

  const sendOtp = async () => {
    const trimmed = email.trim();
    if (!emailRe.test(trimmed)) {
      showToast("Enter a valid email address.", "error");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(apiUrl("/api/send-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        const wait = Number(data.retryAfterSec) || 0;
        if (wait > 0) setResendIn(wait);
        showToast(data.error || "Could not send OTP.", "error");
        return;
      }
      setOtpSent(true);
      const cool = Number(data.resendAfterSec) || 30;
      setResendIn(cool);
      showToast(data.message || "OTP sent. Check your inbox.", "success");
      setTimeout(() => focusOtpIndex(0), 50);
    } catch {
      showToast("Network error. Is the server running?", "error");
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    const trimmed = email.trim();
    if (!emailRe.test(trimmed)) {
      showToast("Enter a valid email address.", "error");
      return;
    }
    if (!/^\d{6}$/.test(otpString)) {
      showToast("Enter the 6-digit code.", "error");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(apiUrl("/api/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, otp: otpString }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        if (data.code === "OTP_EXPIRED") {
          showToast("That code expired. Request a new OTP.", "error");
        } else {
          showToast(data.error || "Verification failed.", "error");
        }
        return;
      }
      setVerified(true);
      setVerificationToken(data.verificationToken || "");
      showToast(data.message || "Email verified.", "success");
    } catch {
      showToast("Network error. Try again.", "error");
    } finally {
      setVerifying(false);
    }
  };

  const submitContact = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const trimmedMsg = message.trim();
    if (!trimmedName || !trimmedMsg) {
      showToast("Name and message are required.", "error");
      return;
    }
    if (!verified || !verificationToken) {
      showToast("Verify your email first.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          message: trimmedMsg,
          verificationToken,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        showToast(data.error || "Could not send message.", "error");
        return;
      }
      showToast(data.message || "Message sent.", "success");
      setMessage("");
    } catch {
      showToast("Network error. Try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const emailLocked = verified;

  const onEmailChange = (v) => {
    setEmail(v);
    if (otpSent || verified) {
      resetFlow();
    }
  };

  const canSubmit = verified && !!verificationToken && !submitting;

  return (
    <div className="mx-auto max-w-xl font-sans text-slate-100">
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-soft backdrop-blur-md sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">
              Secure contact
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Message me
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Verify your email once, then send your note. OTP codes expire in 5 minutes.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="cv-email">
              Email
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="cv-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                disabled={emailLocked}
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white shadow-inset outline-none ring-0 transition focus:border-sky-400/50 focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="you@domain.com"
              />
              <button
                type="button"
                onClick={sendOtp}
                disabled={sending || resendIn > 0 || emailLocked}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending
                  ? "Sending…"
                  : !otpSent
                    ? "Verify email"
                    : resendIn > 0
                      ? `Wait ${resendIn}s`
                      : "Verify email"}
              </button>
            </div>
            {otpSent && resendIn > 0 && (
              <p className="text-xs text-slate-500">Resend code in {resendIn}s</p>
            )}
          </div>

          <AnimatePresence initial={false}>
            {otpSent && !verified && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-slate-200">One-time code</label>
                  <button
                    type="button"
                    className="text-xs font-medium text-sky-300/90 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={sending || resendIn > 0}
                    onClick={sendOtp}
                  >
                    Resend code
                  </button>
                </div>
                <div className="flex justify-between gap-2 sm:justify-start sm:gap-3" onPaste={handleOtpPaste}>
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        otpRefs.current[i] = el;
                      }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={d}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="h-12 w-10 rounded-lg border border-white/10 bg-slate-950/70 text-center text-lg font-semibold tracking-wide text-white shadow-inset outline-none transition focus:border-sky-400/50 focus:ring-2 focus:ring-sky-500/30 sm:h-14 sm:w-12 sm:text-xl"
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={verifying || otpString.length !== 6}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
                >
                  {verifying ? "Verifying…" : "Verify email"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {verified && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3"
              >
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200"
                  aria-hidden
                >
                  ✓
                </motion.span>
                <div>
                  <p className="text-sm font-semibold text-emerald-100">Email verified</p>
                  <p className="text-xs text-emerald-200/80">You can send your message below.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form className="space-y-4 border-t border-white/10 pt-6" onSubmit={submitContact}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="cv-name">
                Name
              </label>
              <input
                id="cv-name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white shadow-inset outline-none transition focus:border-sky-400/50 focus:ring-2 focus:ring-sky-500/30"
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="cv-msg">
                Message
              </label>
              <textarea
                id="cv-msg"
                name="message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white shadow-inset outline-none transition focus:border-sky-400/50 focus:ring-2 focus:ring-sky-500/30"
                placeholder="What are we building?"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {verified && (
                <button
                  type="button"
                  onClick={() => {
                    resetFlow();
                    setEmail("");
                  }}
                  className="text-xs font-medium text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
                >
                  Change email
                </button>
              )}
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-900/25 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto sm:w-auto"
              >
                {submitting ? "Sending…" : "Submit message"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`pointer-events-none fixed bottom-6 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-soft backdrop-blur ${
              toast.type === "success"
                ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-50"
                : toast.type === "error"
                  ? "border-rose-500/30 bg-rose-950/80 text-rose-50"
                  : "border-white/10 bg-slate-900/90 text-slate-100"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
