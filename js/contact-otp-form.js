/**
 * Contact form + OTP (static pages: index.html, contact.html).
 *
 * API base resolution (first match wins):
 * 1. window.PORTFOLIO_API — manual override (staging, forked backend, etc.)
 * 2. file:// page → http://localhost:3000 (open HTML from disk; run API locally)
 * 3. localhost / 127.0.0.1 page host → http://localhost:3000 (local API)
 * 4. Page on *.onrender.com (same app serves API) → same origin (empty base)
 * 5. Otherwise → production Render API below (e.g. Vercel → Render)
 */
(function () {
  "use strict";

  var PRODUCTION_API_BASE = "https://portfolio-website-fajr.onrender.com";
  var LOCAL_DEV_API_BASE = "http://localhost:3000";

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function resolveApiBase() {
    var override = window.PORTFOLIO_API;
    if (typeof override === "string" && override.trim() !== "") {
      return override.trim().replace(/\/$/, "");
    }
    try {
      if (window.location.protocol === "file:") {
        return LOCAL_DEV_API_BASE;
      }
      var host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        return LOCAL_DEV_API_BASE;
      }
      if (host.endsWith(".onrender.com")) {
        return "";
      }
    } catch (e) {
      /* ignore */
    }
    return PRODUCTION_API_BASE;
  }

  function apiUrl(path) {
    var base = resolveApiBase();
    if (!path.startsWith("/")) path = "/" + path;
    return base + path;
  }

  function readJsonFromResponse(res) {
    return res.text().then(function (text) {
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch (e) {
        return {};
      }
    });
  }

  function errorMessageFromResponse(res, data) {
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error.trim();
    }
    if (res.status === 503) {
      return "Email service is not configured or temporarily unavailable.";
    }
    if (res.status === 429) {
      return "Too many attempts. Please wait before trying again.";
    }
    if (res.status >= 500) {
      return "Something went wrong on the server. Please try again later.";
    }
    if (res.status === 400) {
      return "Invalid request. Please check your input.";
    }
    if (res.status === 403) {
      return "Please verify your email before sending.";
    }
    return "Request failed. Please try again.";
  }

  function networkErrorMessage() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "You appear to be offline.";
    }
    return "Could not reach the server. Check your connection and try again.";
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
            return readJsonFromResponse(res).then(function (data) {
              return { res: res, data: data };
            });
          })
          .then(function (pair) {
            var res = pair.res;
            var data = pair.data;
            if (!res.ok) {
              var wait = Number(data.retryAfterSec) || 0;
              if (wait > 0) setResendCountdown(wait);
              showStatus(statusEl, errorMessageFromResponse(res, data), "error");
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
            showStatus(statusEl, networkErrorMessage(), "error");
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
            return readJsonFromResponse(res).then(function (data) {
              return { res: res, data: data };
            });
          })
          .then(function (pair) {
            var res = pair.res;
            var data = pair.data;
            if (!res.ok) {
              if (data.code === "OTP_EXPIRED") {
                showStatus(
                  statusEl,
                  "That code expired. Request a new code.",
                  "error"
                );
              } else {
                showStatus(statusEl, errorMessageFromResponse(res, data), "error");
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
            showStatus(statusEl, networkErrorMessage(), "error");
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
          return readJsonFromResponse(res).then(function (data) {
            return { res: res, data: data };
          });
        })
        .then(function (pair) {
          var res = pair.res;
          var data = pair.data;
          if (!res.ok) {
            showStatus(statusEl, errorMessageFromResponse(res, data), "error");
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
          showStatus(statusEl, networkErrorMessage(), "error");
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  document.querySelectorAll("[data-contact-otp-form]").forEach(initForm);
})();
