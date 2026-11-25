# Deploying Mizan Books to Production

Mizan Books uses **Next.js 15** and **Node 24's built-in SQLite (`node:sqlite`)** with strict per-user multi-tenant isolation (`company_users`), signed HTTP-only cookies + Bearer tokens for mobile, and a built-in `/api/health` endpoint.

---

## Option 1: Docker / VPS (DigitalOcean, Hetzner, AWS EC2, Ubuntu)

1. Copy `.env.example` to `.env` and set a strong secret:
   ```bash
   cp .env.example .env
   openssl rand -hex 32   # paste into MIZAN_SESSION_SECRET
   ```
2. Launch with Docker Compose (auto-mounts persistent volume `mizan_data` at `/app/data`):
   ```bash
   docker compose up -d --build
   ```
3. Put **Caddy** or **Nginx + Certbot** in front of port `3000` for automatic HTTPS. Because `X-Forwarded-Proto: https` is detected automatically, session cookies switch to `Secure` seamlessly.

---

## Option 2: Railway / Render / Fly.io (Managed Cloud)

1. Push this repository to GitHub.
2. Create a new **Docker Web Service** pointing to the included `Dockerfile`.
3. Attach a **Persistent Volume** mounted at `/app/data`.
4. Set environment variables:
   - `MIZAN_SESSION_SECRET` = output of `openssl rand -hex 32`
   - `ENABLE_DEMO_LOGIN` = `false` (or `true` if you want demo buttons visible)
   - `DATA_DIR` = `/app/data`
   - `ALLOWED_ORIGIN` = `https://your-app-domain.com`
5. Set the Health Check path to `/api/health`.

---

## Backups (SQLite Safe Online Backup)

Back up `data/mizan.db` daily (safe even while running in WAL mode):
```bash
sqlite3 /app/data/mizan.db ".backup '/backups/mizan-$(date +%F).db'"
```

---

## Deploying the Native iOS & Android App (`mobile/`)

1. Update the default server URL in `mobile/src/api.ts` to your deployed HTTPS URL (e.g., `https://app.yourdomain.com`).
2. Install EAS CLI and build production binaries for App Store & Google Play:
   ```bash
   cd mobile
   npm install
   npx eas-cli build --platform all
   ```
