# Deploying Mizan Books

Mizan Books is a small accounting app. The books live in one file, `mizan.db`. Before anyone puts a real company on the internet, set a private login secret, do not turn on the sample companies, and keep automatic backups.

Nothing in this repository is a live password. A new server does not create `admin@mizanbooks.com` or the old sample password unless you explicitly ask for the demo.

---

## Settings you must decide

Copy `.env.example` to `.env`. The names below are the ones that matter. Put the real values only in `.env`, which is not committed.

| Name | What to do |
| --- | --- |
| `MIZAN_SESSION_SECRET` | Required. Run `openssl rand -hex 32` and paste the result. Production will not start without a long private value. |
| `ENABLE_DEMO_LOGIN` | Leave `false`. Set `true` only on a throwaway demo, never on a server that holds real books. |
| `INITIAL_ADMIN_EMAIL` | Optional. Your own email, used once to create the first administrator when the database is empty. |
| `INITIAL_ADMIN_PASSWORD` | Optional. Set this together with the email. At least 12 characters. Not a sample password. |
| `INITIAL_ADMIN_NAME` | Optional display name for that administrator. |
| `INITIAL_COMPANY_NAME` | Optional. If set, the first company is created with a chart of accounts. |
| `INITIAL_COMPANY_CURRENCY` | Optional. Defaults to `ETB` when a company name is set. |
| `ALLOWED_ORIGIN` | The public address of the site, such as `https://books.example.com`. |
| `DATA_DIR` | Where `mizan.db` is stored. In Docker this is `/app/data`. |
| `COOKIE_SECURE` | Set `true` once HTTPS is in front of the app. |
| `BACKUP_DIR` | A folder on a different disk from the live database, when you can. |
| `BACKUP_RETENTION_DAYS` | How many days of backup copies to keep. Default 14. |
| `BACKUP_INTERVAL_SECONDS` | How often the backup service runs. Default 86400 (once a day). |
| `PORT` | Host port for Docker. Default 3000. |

If you leave `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` empty, open the site and use **Sign up**. That creates your user and your first company. The sign-in form is blank. It does not offer a sample password.

The first time the app opens an empty database it may create that administrator, including when the health check runs. It never creates the old demo accounts unless `ENABLE_DEMO_LOGIN` is exactly `true`.

---

## Option 1: Docker on a VPS

1. Copy the example settings and fill in the secret (and the first administrator, if you want one):

   ```bash
   cp .env.example .env
   openssl rand -hex 32
   ```

2. Start the app and the backup service. Compose will stop immediately if `MIZAN_SESSION_SECRET` is missing:

   ```bash
   docker compose up -d --build
   ```

3. Put Caddy or Nginx with a certificate in front of port 3000. Then set `COOKIE_SECURE=true` and restart.

The `mizan-backup` service takes a consistent copy of the database once a day into the `mizan_backups` volume and deletes copies older than `BACKUP_RETENTION_DAYS`. It uses SQLite's online backup (`VACUUM INTO`), so the copy is a complete committed snapshot even while someone is entering invoices. Run only one copy of the app against the same database file.

To take a copy by hand inside the app container:

```bash
docker compose exec -T mizan-books node scripts/backup-sqlite.mjs
```

Set `BACKUP_DIR` to a folder that is not the live database folder. A host cron job can do the same thing:

```bash
0 2 * * * cd /opt/mizan-books && DATA_DIR=/var/lib/mizan BACKUP_DIR=/var/backups/mizan BACKUP_RETENTION_DAYS=14 /usr/bin/node scripts/backup-sqlite.mjs
```

Restore by stopping the app, replacing `mizan.db` with a backup file (and removing any `mizan.db-wal` and `mizan.db-shm` left beside it), then starting the app again. Try that once on a spare machine before you rely on it.

---

## Option 2: Railway, Render, or Fly.io

1. Push this repository to GitHub.
2. Create a Docker web service from the included `Dockerfile`.
3. Attach a persistent disk mounted at `/app/data`.
4. Set `MIZAN_SESSION_SECRET`, `ENABLE_DEMO_LOGIN=false`, `DATA_DIR=/app/data`, and `ALLOWED_ORIGIN` to the public site. Add `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` if you want the first administrator created for you.
5. Set the health check path to `/api/health`.
6. Run `node scripts/backup-sqlite.mjs` on a daily schedule, with `BACKUP_DIR` pointed at a second disk or a copy you download off the server. The health check does not turn on demo data.

---

## Phone app

The phone app under `mobile/` is separate. Point it at your HTTPS address before building store binaries. It does not ship with a filled-in password.

```bash
cd mobile
npm install
npx eas-cli build --platform all
```
