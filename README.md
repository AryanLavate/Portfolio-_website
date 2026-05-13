# Portfolio website (frontend + email backend)

## Run locally

1) Install backend deps:

```bash
cd server
npm install
```

2) Configure email:

- Copy `server/.env.example` to `server/.env`
- Fill:
  - `MAIL_TO` (where you want to receive emails)
  - `MAIL_FROM` (from address shown in the email)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

3) Start the server (serves the website + API):

```bash
cd server
npm run start
```

Open `http://localhost:3000`.

## Contact form

The contact form submits to `POST /api/contact` and sends an email via SMTP using Nodemailer.
