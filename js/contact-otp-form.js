// ===============================
// COMPLETE index.js BACKEND CODE
// ===============================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import crypto from "crypto";

dotenv.config();

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "*",
  })
);

// ===============================
// OTP + VERIFICATION STORAGE
// ===============================

const otpStore = {};
const verifiedUsers = {};

// ===============================
// MAIL TRANSPORTER
// ===============================

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ===============================
// SEND OTP API
// ===============================

app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: "Email is required",
      });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Expiry time = 5 mins
    const expiresAt = Date.now() + 5 * 60 * 1000;

    // Save OTP
    otpStore[email] = {
      otp,
      expiresAt,
    };

    // Send email
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Verify Your Email",
      html: `
        <div style="font-family:sans-serif;padding:20px;">
          <h2>Email Verification</h2>
          <p>Your OTP code is:</p>
          
          <h1 style="
            letter-spacing:5px;
            color:#2563eb;
          ">
            ${otp}
          </h1>

          <p>This code expires in 5 minutes.</p>
        </div>
      `,
    });

    return res.json({
      ok: true,
      message: "OTP sent successfully",
      resendAfterSec: 30,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      ok: false,
      error: "Failed to send OTP",
    });
  }
});

// ===============================
// VERIFY OTP API
// ===============================

app.post("/api/verify-otp", (req, res) => {
  try {
    const { email, otp } = req.body;

    const savedOtp = otpStore[email];

    if (!savedOtp) {
      return res.status(400).json({
        ok: false,
        error: "OTP not found",
      });
    }

    // Check expiry
    if (Date.now() > savedOtp.expiresAt) {
      delete otpStore[email];

      return res.status(400).json({
        ok: false,
        code: "OTP_EXPIRED",
        error: "OTP expired",
      });
    }

    // Verify OTP
    if (savedOtp.otp !== otp) {
      return res.status(400).json({
        ok: false,
        error: "Invalid OTP",
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    verifiedUsers[email] = {
      token: verificationToken,
      verifiedAt: Date.now(),
    };

    // Delete OTP after success
    delete otpStore[email];

    return res.json({
      ok: true,
      message: "Email verified successfully",
      verificationToken,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      ok: false,
      error: "Verification failed",
    });
  }
});

// ===============================
// CONTACT FORM API
// ===============================

app.post("/api/contact", async (req, res) => {
  try {
    const {
      name,
      email,
      message,
      verificationToken,
    } = req.body;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        ok: false,
        error: "All fields are required",
      });
    }

    // Check verification
    const verifiedUser = verifiedUsers[email];

    if (
      !verifiedUser ||
      verifiedUser.token !== verificationToken
    ) {
      return res.status(401).json({
        ok: false,
        error: "Email not verified",
      });
    }

    // Send email to YOU
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_TO,
      subject: `Portfolio Contact from ${name}`,
      html: `
        <div style="font-family:sans-serif;padding:20px;">
          <h2>New Portfolio Contact</h2>

          <p><strong>Name:</strong> ${name}</p>

          <p><strong>Email:</strong> ${email}</p>

          <p><strong>Message:</strong></p>

          <div style="
            background:#f3f4f6;
            padding:15px;
            border-radius:10px;
          ">
            ${message}
          </div>
        </div>
      `,
    });

    // Auto reply to client
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Message Received",
      html: `
        <div style="font-family:sans-serif;padding:20px;">
          <h2>Thanks for contacting me</h2>

          <p>
            I received your message and
            will get back to you soon.
          </p>

          <br />

          <p>— Aryan Lavate</p>
        </div>
      `,
    });

    return res.json({
      ok: true,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      ok: false,
      error: "Failed to send message",
    });
  }
});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.send("Portfolio API Running");
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});