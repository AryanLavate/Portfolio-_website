import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";

const app = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const contactUiDir = path.join(rootDir, "contact-ui");

dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://portfolio-website-tau-eight-11.vercel.app",
];

if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(",").forEach((origin) => {
    const clean = origin.trim();

    if (clean && !allowedOrigins.includes(clean)) {
      allowedOrigins.push(clean);
    }
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin
      // (mobile apps, Postman, curl, same-origin)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("Blocked by CORS:", origin);

      return callback(new Error("Not allowed by CORS"));
    },

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],

    credentials: true,
  })
);

// Handle preflight requests
app.options("*", cors());

app.use(express.json({ limit: "64kb" }));