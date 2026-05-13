(function () {
  function getApiBases() {
    var bases = [];
    if (typeof window.PORTFOLIO_API === "string" && window.PORTFOLIO_API) {
      bases.push(window.PORTFOLIO_API.replace(/\/$/, ""));
    }
    if (typeof window.location === "object" && window.location.origin) {
      bases.push(window.location.origin.replace(/\/$/, ""));
    }
    // Common local dev default when you're running the Express API on :3000
    bases.push("http://localhost:3000", "http://127.0.0.1:3000");
    // De-dupe while preserving order
    return bases.filter(function (b, i) {
      return b && bases.indexOf(b) === i;
    });
  }

  function postJsonWithApiFallback(path, payload) {
    var opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
    var bases = getApiBases();
    var idx = 0;
    var lastError = null;

    function attempt() {
      if (idx >= bases.length) {
        return Promise.reject(lastError || new Error("API request failed"));
      }

      var base = bases[idx++];
      var url = base ? base.replace(/\/$/, "") + path : path;

      return fetch(url, opts)
        .then(function (res) {
          return res.text().then(function (text) {
            return { res: res, data: readJson(text) };
          });
        })
        .then(function (r) {
          // If you're serving the static site from a different port,
          // you'll often get a 404 from that server instead of the Express API.
          // In that case, try the next candidate base.
          if (r && r.res && (r.res.status === 404 || r.res.status === 405)) {
            return attempt();
          }
          return r;
        })
        .catch(function (err) {
          lastError = err;
          return attempt();
        });
    }

    return attempt();
  }

  function showStatus(box, type, text) {
    if (!box) return;
    box.hidden = false;
    box.className =
      "form-status form-status--" + (type === "success" ? "success" : "error");
    box.textContent = text;
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
  }

  function hideStatus(box) {
    if (!box) return;
    box.hidden = true;
    box.textContent = "";
    box.className = "form-status";
  }

  function validateEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function readJson(text) {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  function attach(form) {
    if (!form || form.getAttribute("data-contact-otp-bound") === "true") return;
    form.setAttribute("data-contact-otp-bound", "true");

    var status = form.querySelector("[data-form-status]");
    var emailIn = form.querySelector("[data-otp-email]");
    var nameIn = form.querySelector('[name="name"]');
    var msgIn = form.querySelector('[name="message"]');
    var sendBtn = form.querySelector("[data-send-otp]");
    var verifyBtn = form.querySelector("[data-verify-otp]");
    var otpWrap = form.querySelector("[data-otp-wrap]");
    var verifiedBox = form.querySelector("[data-verified-box]");
    var changeEmailBtn = form.querySelector("[data-change-email]");
    var submitBtn = form.querySelector("[data-submit-contact]");
    var resendNote = form.querySelector("[data-resend-note]");
    var otpInputs = Array.prototype.slice.call(form.querySelectorAll("[data-otp-digit]"));

    if (otpWrap) otpWrap.hidden = true;
    if (verifiedBox) verifiedBox.hidden = true;
    if (changeEmailBtn) changeEmailBtn.hidden = true;

    var verificationToken = "";
    var otpSent = false;
    var verified = false;
    var sentForEmail = "";
    var resendTimer = null;
    var resendSeconds = 0;

    function clearResendTimer() {
      if (resendTimer) clearInterval(resendTimer);
      resendTimer = null;
    }

    function updateSendLabel() {
      if (!sendBtn) return;
      if (!sendBtn.dataset.baseSend) sendBtn.dataset.baseSend = "Verify email";
      if (!sendBtn.dataset.baseResend)
        sendBtn.dataset.baseResend = "Verify email";
      if (verified) return;
      if (otpSent && resendSeconds <= 0) {
        sendBtn.textContent = sendBtn.dataset.baseResend;
      } else {
        sendBtn.textContent = sendBtn.dataset.baseSend;
      }
    }

    function updateResendUi() {
      if (resendNote) {
        resendNote.textContent =
          resendSeconds > 0 ? "Resend code in " + resendSeconds + "s" : "";
      }
      if (sendBtn) {
        if (verified) {
          sendBtn.disabled = true;
        } else {
          sendBtn.disabled = sending || verifying || resendSeconds > 0;
        }
      }
      updateSendLabel();
    }

    var sending = false;
    var verifying = false;

    function startResendCountdown(sec) {
      resendSeconds = Math.max(0, Number(sec) || 0);
      clearResendTimer();
      updateResendUi();
      if (resendSeconds <= 0) return;
      resendTimer = setInterval(function () {
        resendSeconds -= 1;
        if (resendSeconds <= 0) {
          resendSeconds = 0;
          clearResendTimer();
        }
        updateResendUi();
      }, 1000);
    }

    function otpValue() {
      return otpInputs.map(function (i) { return (i.value || "").replace(/\D/g, ""); }).join("");
    }

    function resetOtpDigits() {
      otpInputs.forEach(function (inp) {
        inp.value = "";
      });
    }

    function resetVerification() {
      verified = false;
      verificationToken = "";
      otpSent = false;
      sentForEmail = "";
      resetOtpDigits();
      if (otpWrap) otpWrap.hidden = true;
      if (verifiedBox) verifiedBox.hidden = true;
      if (changeEmailBtn) changeEmailBtn.hidden = true;
      if (emailIn) {
        emailIn.readOnly = false;
        emailIn.removeAttribute("readonly");
      }
      if (submitBtn) submitBtn.disabled = true;
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.textContent =
          verifyBtn.dataset.idleVerify || "Verify email";
      }
      clearResendTimer();
      resendSeconds = 0;
      updateResendUi();
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = sendBtn.dataset.baseSend || "Verify email";
      }
    }

    function markVerified(token) {
      verified = true;
      verificationToken = token;
      if (verifiedBox) verifiedBox.hidden = false;
      if (changeEmailBtn) changeEmailBtn.hidden = false;
      if (otpWrap) otpWrap.hidden = true;
      if (emailIn) {
        emailIn.readOnly = true;
        emailIn.setAttribute("readonly", "readonly");
      }
      if (submitBtn) submitBtn.disabled = false;
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = sendBtn.dataset.baseSend || "Verify email";
      }
      if (verifyBtn) verifyBtn.disabled = true;
      clearResendTimer();
      resendSeconds = 0;
      if (resendNote) resendNote.textContent = "";
    }

    function syncVerifyDisabled() {
      if (!verifyBtn) return;
      verifyBtn.disabled = verifying || otpValue().length !== 6;
    }

    if (emailIn) {
      emailIn.addEventListener("input", function () {
        if (verified) return;
        var cur = emailIn.value.trim().toLowerCase();
        if (otpSent && sentForEmail && cur !== sentForEmail) {
          otpSent = false;
          sentForEmail = "";
          resetOtpDigits();
          if (otpWrap) otpWrap.hidden = true;
          clearResendTimer();
          resendSeconds = 0;
          updateResendUi();
        }
      });
    }

    otpInputs.forEach(function (inp, idx) {
      inp.addEventListener("input", function () {
        var d = (inp.value || "").replace(/\D/g, "");
        inp.value = d.slice(0, 1);
        if (d && idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
        syncVerifyDisabled();
      });
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !inp.value && idx > 0) {
          e.preventDefault();
          otpInputs[idx - 1].focus();
        }
      });
    });

    if (otpWrap) {
      otpWrap.addEventListener("paste", function (e) {
        e.preventDefault();
        var text = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
        for (var i = 0; i < otpInputs.length; i += 1) {
          otpInputs[i].value = text[i] || "";
        }
        var last = Math.min(text.length, otpInputs.length - 1);
        otpInputs[last].focus();
        syncVerifyDisabled();
      });
    }

    function doSendOtp() {
      hideStatus(status);
      var email = emailIn ? emailIn.value.trim() : "";
      if (!validateEmail(email)) {
        showStatus(status, "error", "Enter a valid email address.");
        return;
      }
      sending = true;
      if (sendBtn) {
        sendBtn.disabled = true;
        if (!sendBtn.dataset.sendingLabel) sendBtn.dataset.sendingLabel = "Sending…";
        sendBtn.textContent = sendBtn.dataset.sendingLabel;
      }
      postJsonWithApiFallback("/api/send-otp", { email: email })
        .then(function (r) {
          if (r && r.res && r.res.ok && r.data && r.data.ok) {
            otpSent = true;
            sentForEmail = email.toLowerCase();
            if (otpWrap) otpWrap.hidden = false;
            resetOtpDigits();
            syncVerifyDisabled();
            var cool = Number(r.data.resendAfterSec) || 30;
            startResendCountdown(cool);
            showStatus(
              status,
              "success",
              (r.data && r.data.message) || "OTP sent — check your inbox."
            );
            setTimeout(function () {
              if (otpInputs[0]) otpInputs[0].focus();
            }, 50);
          } else {
            var wait = Number(r.data && r.data.retryAfterSec) || 0;
            if (wait > 0) startResendCountdown(wait);
            var msg = r.data && r.data.error ? r.data.error : "";
            if (!msg) {
              msg =
                "Could not send OTP. Start the API (npm start) and open the site from `http://localhost:3000`, or set `window.PORTFOLIO_API`.";
            }
            showStatus(status, "error", msg);
          }
        })
        .catch(function () {
          showStatus(
            status,
            "error",
            "Could not reach the server. Start the API (npm start) and open this site from that server."
          );
        })
        .finally(function () {
          sending = false;
          if (sendBtn && !verified) {
            if (resendSeconds > 0) {
              sendBtn.disabled = true;
            } else {
              sendBtn.disabled = false;
            }
            if (otpSent && resendSeconds <= 0) {
              sendBtn.textContent = sendBtn.dataset.baseResend || "Verify email";
            } else {
              sendBtn.textContent = sendBtn.dataset.baseSend || "Verify email";
            }
          }
          updateResendUi();
        });
    }

    if (sendBtn) sendBtn.addEventListener("click", doSendOtp);

    if (verifyBtn) {
      verifyBtn.addEventListener("click", function () {
        hideStatus(status);
        var email = emailIn ? emailIn.value.trim() : "";
        if (!validateEmail(email)) {
          showStatus(status, "error", "Enter a valid email address.");
          return;
        }
        var otp = otpValue();
        if (!/^\d{6}$/.test(otp)) {
          showStatus(status, "error", "Enter the 6-digit code.");
          return;
        }
        verifying = true;
        verifyBtn.disabled = true;
        if (!verifyBtn.dataset.verifyingLabel) verifyBtn.dataset.verifyingLabel = "Verifying…";
        if (!verifyBtn.dataset.idleVerify) {
          verifyBtn.dataset.idleVerify = verifyBtn.textContent || "Verify email";
        }
        verifyBtn.textContent = verifyBtn.dataset.verifyingLabel;
        postJsonWithApiFallback("/api/verify-otp", { email: email, otp: otp })
          .then(function (r) {
            if (r && r.res && r.res.ok && r.data && r.data.ok) {
              markVerified(r.data.verificationToken || "");
              showStatus(
                status,
                "success",
                (r.data && r.data.message) || "Email verified."
              );
            } else {
              var msg = r.data && r.data.error ? r.data.error : "Verification failed.";
              if (r.data && r.data.code === "OTP_EXPIRED") {
                msg = "That code expired. Request a new OTP.";
              }
              showStatus(status, "error", msg);
            }
          })
          .catch(function () {
            showStatus(status, "error", "Network error. Try again.");
          })
          .finally(function () {
            verifying = false;
            if (!verifyBtn) return;
            verifyBtn.textContent =
              verifyBtn.dataset.idleVerify || "Verify email";
            if (verified) {
              verifyBtn.disabled = true;
            } else {
              syncVerifyDisabled();
            }
          });
      });
    }

    if (changeEmailBtn) {
      changeEmailBtn.addEventListener("click", function () {
        resetVerification();
        hideStatus(status);
        if (emailIn) emailIn.focus();
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hideStatus(status);
      var name = nameIn && nameIn.value ? nameIn.value.trim() : "";
      var email = emailIn ? emailIn.value.trim() : "";
      var message = msgIn && msgIn.value ? msgIn.value.trim() : "";
      var errs = [];
      if (!name) errs.push("Name is required.");
      if (!email) errs.push("Email is required.");
      else if (!validateEmail(email)) errs.push("Enter a valid email address.");
      if (!message) errs.push("Message is required.");
      if (!verified || !verificationToken) errs.push("Verify your email first.");
      if (errs.length) {
        showStatus(status, "error", errs.join(" "));
        return;
      }
      if (!submitBtn) return;
      submitBtn.disabled = true;
      if (!submitBtn.dataset.sendingMsg) submitBtn.dataset.sendingMsg = "Sending…";
      if (!submitBtn.dataset.idleSubmit) submitBtn.dataset.idleSubmit = submitBtn.textContent;
      submitBtn.textContent = submitBtn.dataset.sendingMsg;
      postJsonWithApiFallback("/api/contact", {
        name: name,
        email: email,
        message: message,
        verificationToken: verificationToken,
      })
        .then(function (r) {
          if (r && r.res && r.res.ok && r.data && r.data.ok) {
            showStatus(
              status,
              "success",
              (r.data && r.data.message) ||
                "Thanks — your message was sent."
            );
            if (msgIn) msgIn.value = "";
            resetVerification();
            if (nameIn) nameIn.value = "";
            if (emailIn) emailIn.value = "";
          } else {
            showStatus(
              status,
              "error",
              (r.data && r.data.error) || "Something went wrong."
            );
          }
        })
        .catch(function () {
          showStatus(
            status,
            "error",
            "Could not reach the server. Check your connection."
          );
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = !verified || !verificationToken;
            submitBtn.textContent =
              submitBtn.dataset.idleSubmit || "Send message";
          }
        });
    });

    syncVerifyDisabled();
  }

  document.querySelectorAll("[data-contact-otp-form]").forEach(attach);
})();
