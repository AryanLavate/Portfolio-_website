# Deploying the portfolio with email OTP

This project has two main pieces:

1. **Static pages** (`index.html`, `contact.html`, …) at the repository root — contact uses the same **site CSS** (`css/style.css`) and **`js/contact-otp-form.js`** for OTP + submit.
2. **Express API + static hosting** in `server/` (sends OTP + contact email, serves the site).

The **`client/`** + **`contact-ui/`** Vite bundle is **optional** (legacy alternate UI). The live pages do **not** load `/contact-ui` by default.

## Local development

1. Copy `server/.env.example` to `server/.env` and fill in Gmail SMTP values (use a [Google App Password](https://support.google.com/accounts/answer/185833) if 2FA is on).
2. Install server dependencies:

```bash
cd server
npm install
```

3. Start the API (serves the whole site + `/api/*`):

```bash
npm start
```

Open `http://localhost:3000` (or the `PORT` you set).

From the repo root you can use `npm start` if your root `package.json` points at the server.

**Optional:** to work on the separate React experiment in `client/`, run `npm run install:all` and `npm run dev` from the repo root (server + Vite). That is not required for the main contact form.

## Uploading to a host (beginner-friendly)

**Option A — Single Node server (simplest)**  
Upload the full repo (or a zip). On the server:

- Set Node 18+.
- Run `cd server && npm install`.
- Set environment variables (same keys as `server/.env.example`).
- Start with `npm start` from `server/` (or `npm start` from root if configured).

Your host should bind `PORT` to the public port (many platforms set this automatically).

**Option B — Static site + API split**  
Host HTML/CSS/JS on Netlify/Vercel/Cloudflare Pages, run the Express app on Railway/Render/Fly.io. Set `window.PORTFOLIO_API = 'https://your-api.example.com'` in a small inline script **before** `contact-otp-form.js` so fetches hit your API (and configure `CORS_ORIGIN` on the server).

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/send-otp` | Send 6-digit OTP (also `/send-otp`) |
| POST | `/api/verify-otp` | Verify OTP, returns `verificationToken` (also `/verify-otp`) |
| POST | `/api/contact` | Send message; requires `verificationToken` (also `/contact`) |

## Security checklist

- Never commit `server/.env` or real SMTP passwords.
- Use a long random `VERIFICATION_SECRET` in production.
- Enable `TRUST_PROXY=1` when running behind a reverse proxy so rate limits use the real client IP.
