/**
 * Browser contact form + OTP. Expects a running API (see server/) at the same
 * origin or at window.PORTFOLIO_API (no trailing slash), e.g. set before this script:
 *   <script>window.PORTFOLIO_API = "https://your-api.onrender.com";</script>
 */
(function () {
  "use strict";

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function apiBase() {
    var raw = window.PORTFOLIO_API;
    if (raw == null || raw === "") return "";
    return String(raw).replace(/\/$/, "");
  }

  function apiUrl(path) {
    var b = apiBase();
    if (!path.startsWith("/")) path = "/" + path;
    return b + path;
  }

  function readJson(res) {
    return res.json().catch(function () {
      return {};
    });
  }

  function showStatus(el, text, kind) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.remove("form-status--error", "form-status--success");
    if (kind === "error") el.classList.add("form-status--error");
    if (kind === "success") el.classList.add("form-status--success");
  }

  function digitsValue(inputs) {
    return inputs
      .map(function (i) {
        return (i.value || "").replace(/\D/g, "");
      })
      .join("");
  }

  function initForm(form) {
    var emailInput = form.querySelector("[data-otp-email]");
    var sendBtn = form.querySelector("[data-send-otp]");
    var resendNote = form.querySelector("[data-resend-note]");
    var otpWrap = form.querySelector("[data-otp-wrap]");
    var digitInputs = Array.prototype.slice.call(
      form.querySelectorAll("[data-otp-digit]")
    );
    var verifyBtn = form.querySelector("[data-verify-otp]");
    var verifiedBox = form.querySelector("[data-verified-box]");
    var changeEmailBtn = form.querySelector("[data-change-email]");
    var submitBtn = form.querySelector("[data-submit-contact]");
    var statusEl = form.querySelector("[data-form-status]");

    var verificationToken = null;
    var resendTimer = null;
    var resendSec = 0;

    function clearResendTimer() {
      if (resendTimer) clearInterval(resendTimer);
      resendTimer = null;
    }

    function setResendCountdown(sec) {
      clearResendTimer();
      resendSec = Math.max(0, Math.floor(sec));
      function tick() {
        if (resendSec <= 0) {
          clearResendTimer();
          if (resendNote) resendNote.textContent = "";
          if (sendBtn) sendBtn.disabled = false;
          return;
        }
        if (resendNote)
          resendNote.textContent = "Resend code in " + resendSec + "s";
        if (sendBtn) sendBtn.disabled = true;
        resendSec--;
      }
      tick();
      resendTimer = setInterval(tick, 1000);
    }

    function resetOtpUi() {
      digitInputs.forEach(function (el) {
        el.value = "";
      });
      if (otpWrap) otpWrap.hidden = true;
      if (verifiedBox) verifiedBox.hidden = true;
      if (changeEmailBtn) changeEmailBtn.hidden = true;
      verificationToken = null;
      if (submitBtn) submitBtn.disabled = true;
      clearResendTimer();
      if (resendNote) resendNote.textContent = "";
      if (sendBtn) sendBtn.disabled = false;
    }

    function onVerified() {
      if (otpWrap) otpWrap.hidden = true;
      if (verifiedBox) verifiedBox.hidden = false;
      if (changeEmailBtn) changeEmailBtn.hidden = false;
      if (submitBtn) submitBtn.disabled = false;
      clearResendTimer();
      if (resendNote) resendNote.textContent = "";
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = "Verified";
      }
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        var email = (emailInput && emailInput.value) || "";
        email = email.trim().toLowerCase();
        if (!emailRe.test(email)) {
          showStatus(statusEl, "Enter a valid email address.", "error");
          return;
        }

        sendBtn.disabled = true;
        showStatus(statusEl, "", null);

        fetch(apiUrl("/api/send-otp"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email }),
        })
          .then(function (res) {
            return readJson(res).then(function (data) {
              return { res: res, data: data };
            });
          })
          .then(function (_ref) {
            var res = _ref.res;
            var data = _ref.data;
            if (!res.ok) {
              var wait = Number(data.retryAfterSec) || 0;
              if (wait > 0) setResendCountdown(wait);
              showStatus(
                statusEl,
                data.error || "Could not send verification code.",
                "error"
              );
              sendBtn.disabled = wait > 0;
              return;
            }
            if (otpWrap) otpWrap.hidden = false;
            setResendCountdown(Number(data.resendAfterSec) || 30);
            showStatus(
              statusEl,
              data.message || "Check your inbox for the code.",
              "success"
            );
            if (digitInputs[0]) digitInputs[0].focus();
          })
          .catch(function () {
            showStatus(
              statusEl,
              "Network error. If the site is static-only, set window.PORTFOLIO_API to your API URL.",
              "error"
            );
            sendBtn.disabled = false;
          });
      });
    }

    if (verifyBtn) {
      verifyBtn.addEventListener("click", function () {
        var email = (emailInput && emailInput.value) || "";
        email = email.trim().toLowerCase();
        var otp = digitsValue(digitInputs);
        if (!emailRe.test(email)) {
          showStatus(statusEl, "Enter a valid email address.", "error");
          return;
        }
        if (!/^\d{6}$/.test(otp)) {
          showStatus(statusEl, "Enter the 6-digit code from your email.", "error");
          return;
        }

        verifyBtn.disabled = true;
        fetch(apiUrl("/api/verify-otp"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, otp: otp }),
        })
          .then(function (res) {
            return readJson(res).then(function (data) {
              return { res: res, data: data };
            });
          })
          .then(function (_ref2) {
            var res = _ref2.res;
            var data = _ref2.data;
            if (!res.ok) {
              if (data.code === "OTP_EXPIRED") {
                showStatus(
                  statusEl,
                  "That code expired. Request a new code.",
                  "error"
                );
              } else {
                showStatus(
                  statusEl,
                  data.error || "Verification failed.",
                  "error"
                );
              }
              verifyBtn.disabled = false;
              return;
            }
            verificationToken = data.verificationToken || null;
            if (!verificationToken) {
              showStatus(statusEl, "Server did not return a token.", "error");
              verifyBtn.disabled = false;
              return;
            }
            showStatus(statusEl, data.message || "Email verified.", "success");
            onVerified();
          })
          .catch(function () {
            showStatus(statusEl, "Network error. Try again.", "error");
            verifyBtn.disabled = false;
          });
      });
    }

    digitInputs.forEach(function (input, index) {
      input.addEventListener("input", function () {
        var v = (input.value || "").replace(/\D/g, "").slice(0, 1);
        input.value = v;
        if (v && index < digitInputs.length - 1) digitInputs[index + 1].focus();
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !input.value && index > 0) {
          digitInputs[index - 1].focus();
        }
      });
    });

    if (changeEmailBtn) {
      changeEmailBtn.addEventListener("click", function () {
        resetOtpUi();
        if (sendBtn) sendBtn.textContent = "Verify email";
        showStatus(statusEl, "", null);
        if (emailInput) emailInput.focus();
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!verificationToken) {
        showStatus(statusEl, "Verify your email before sending.", "error");
        return;
      }

      var fd = new FormData(form);
      var name = (fd.get("name") || "").toString().trim();
      var email = (fd.get("email") || "").toString().trim().toLowerCase();
      var message = (fd.get("message") || "").toString().trim();

      if (!name || !email || !message) {
        showStatus(statusEl, "Please fill in all fields.", "error");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      showStatus(statusEl, "Sending…", null);

      fetch(apiUrl("/api/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          email: email,
          message: message,
          verificationToken: verificationToken,
        }),
      })
        .then(function (res) {
          return readJson(res).then(function (data) {
            return { res: res, data: data };
          });
        })
        .then(function (_ref3) {
          var res = _ref3.res;
          var data = _ref3.data;
          if (!res.ok) {
            showStatus(
              statusEl,
              data.error || "Could not send your message.",
              "error"
            );
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
          showStatus(
            statusEl,
            data.message || "Thanks — your message was sent.",
            "success"
          );
          form.reset();
          resetOtpUi();
          if (sendBtn) sendBtn.textContent = "Verify email";
        })
        .catch(function () {
          showStatus(statusEl, "Network error. Try again.", "error");
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  document.querySelectorAll("[data-contact-otp-form]").forEach(initForm);
})();
