# Mizan Books — deployment readiness review

**Verdict: not yet.**

Reviewed on 25 November 2026. This is a read-only review. No application code was changed, nothing was deployed, and no secret or `.env` file was added to the repository.

Mizan Books is a real, buildable accounting app with a sensible shape: a web screen, a small API, one database file, and a Docker setup. The sample companies that ship with it do balance. It is fine to keep using on a private computer as a demonstration.

It is not ready to put on the internet with a real business’s books. A brand-new database creates administrator logins whose password is published in the source code. The key that protects login cookies falls back to a published phrase, and the server still starts. A journal can be saved against another company’s accounts, which can hide an amount or knock the books out of balance. Money is stored in a form that can be a fraction of a cent off, and the app will still call the books “balanced.” Nothing backs the database up automatically.

The sections below say what was checked, what the commands actually printed, and what to fix first.

---

## 1. What this app is, and how it is meant to run

Mizan Books is a multilingual double-entry accounting app for a small business. One person can sign up, create a company, and keep a chart of accounts, journals, customers, invoices, vendors, bills, inventory, payroll, and reports (trial balance, profit and loss, balance sheet, tax summary). It speaks English, Amharic, Afaan Oromo, Somali, and Arabic. Arabic is set up to read right to left. Dates can be shown on the Gregorian calendar or the Ethiopian calendar. The currencies it knows are Ethiopian birr, US dollar, Somali shilling, Kenyan shilling, Saudi riyal, UAE dirham, and euro. Tax presets cover Ethiopia, Saudi Arabia, the UAE, Kenya, Somalia, and a tax-exempt option.

There is also a phone companion under `mobile/`. It is a separate Expo (React Native) app that talks to this server. It is not what the Docker setup runs.

### Stack

| Piece | What it is | Where |
| --- | --- | --- |
| Web app and API | Next.js 15 and React 19, written in TypeScript | `package.json`, `src/` |
| Styling | Tailwind CSS 4 | `package.json`, `postcss.config.mjs` |
| Database | One SQLite file, using Node’s built-in `node:sqlite` | `src/lib/db.ts` |
| Phone app | Expo / React Native | `mobile/package.json` |
| Container | Node 24 image | `Dockerfile`, `docker-compose.yml` |

The installed Next.js version, after a clean install from the lockfile, is **15.5.29**.

There is no separate database server. The books live in a single file, `mizan.db`, inside the folder named by `DATA_DIR` (or `./data` if that variable is missing). The schema is created the first time the app opens the file. See `getDb()` in `src/lib/db.ts`.

### Commands

From `package.json`:

- `npm run dev` — development server on port 3000
- `npm run build` — production build
- `npm start` — serve the production build on port 3000
- `npm run lint` — lint (this does not currently succeed; see section 2)

There is no `test` script.

### How a deployment is supposed to work

`DEPLOY.md` describes two paths.

1. A VPS with Docker Compose. Copy `.env.example` to `.env`, put a long random value in `MIZAN_SESSION_SECRET`, then run `docker compose up -d --build`. Put Caddy or Nginx with a certificate in front of port 3000.
2. Railway, Render, or Fly.io, using the included `Dockerfile`, a persistent disk mounted at `/app/data`, and a health check path of `/api/health`.

The Docker image builds the app, listens on port 3000, stores the database in `/app/data`, and has a health check that calls `/api/health`. Compose publishes that port and keeps the database in a Docker volume named `mizan_data`.

### Settings the app reads

From `.env.example`, `docker-compose.yml`, `src/lib/auth.ts`, `src/lib/db.ts`, and `next.config.ts`:

| Variable | What it does if you set it | What happens if you leave it out |
| --- | --- | --- |
| `MIZAN_SESSION_SECRET` | Signs login cookies and phone tokens | Falls back to a fixed phrase in `src/lib/auth.ts`. The app prints a warning and keeps running. |
| `ENABLE_DEMO_LOGIN` | `false` hides the one-click demo buttons | Any value other than the exact word `false` leaves the demo buttons on. |
| `ALLOWED_ORIGIN` | Which other websites may call the API | Defaults to `*`, meaning any website. Compose also defaults to `*`. |
| `DATA_DIR` | Folder for `mizan.db` | `./data` on the machine, or `/app/data` inside the image. |
| `COOKIE_SECURE` | Forces the login cookie’s “secure” flag on or off | Follows the `X-Forwarded-Proto` header. Plain HTTP leaves the cookie unprotected. |
| `PORT` | Published host port in Compose | 3000. |

The app does not terminate HTTPS itself. `DEPLOY.md` expects a reverse proxy to do that.

---

## 2. Install, build, lint, type-check, and tests

Checked on this machine with **Node v22.23.4** and **npm 10.9.9**. The Dockerfile asks for Node 24. Docker is not installed here, so the image itself was not built. Packages were installed only from the existing lockfile (`npm ci`). Nothing new was added to `package.json`.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci` | **Passed.** Exit code 0. Added 50 packages from `package-lock.json`. npm then reported 2 known vulnerabilities (1 high, 1 moderate). Details are in the security section. |
| Type-check | `npx tsc --noEmit` | **Passed.** Exit code 0. No error output. |
| Production build | `npm run build` | **Passed.** Exit code 0. Next.js 15.5.29 compiled successfully and generated 22 pages. During the build it printed two warnings, copied below. |
| Lint | `npm run lint` | **Failed.** Exit code 1. ESLint is not installed and there is no ESLint config. `next lint` stopped on the question “How would you like to configure ESLint?” |
| Tests | `npm test` | **Failed to run.** Exit code 1. npm said `Missing script: "test"`. |

There are **no test files** in the repository (no `*.test.*` or `*.spec.*` files, and none under `mobile/`). So the real count is:

- Tests defined: **0**
- Passed: **0**
- Failed: **0**
- The test command itself: **failed**, because it does not exist

The two warnings from `npm run build` were:

1. `[Mizan Books] WARNING: MIZAN_SESSION_SECRET is using the default dev secret. Set a strong secret in production.`
2. `ExperimentalWarning: SQLite is an experimental feature and might change at any time`

The first warning is the app noticing that the login secret was not set. It warned and continued. The second is because this check used Node 22, where the built-in SQLite module is still marked experimental. The Docker image is based on Node 24, which is the runtime the project is written for. That image was not run here.

The phone app was not installed. `mobile/` has a `package.json` and no lockfile, and it is not part of the server image (`.dockerignore` excludes it).

---

## 3. Security

### Secrets in the repository

No `.env` file is committed. `.gitignore` ignores `.env`, `.env.local`, `.env.production`, and the database files. `.env.example` contains placeholders, not a live key. A search of the tracked files did not find a cloud API key, a private key, or a production password.

What is committed, on purpose, are **defaults that become dangerous if a deployment forgets to replace them**:

- `src/lib/auth.ts` (lines 6–10) uses `mizan-accounting-local-dev-secret-v1` whenever `MIZAN_SESSION_SECRET` is missing. In production it only prints a warning.
- `docker-compose.yml` (line 11) substitutes `change-me-to-a-64-char-random-secret` when the variable is empty. That phrase is different from the one the warning looks for, so Compose can boot on a published secret **with no warning at all**.
- `src/lib/db.ts` (around lines 662–671) creates three users the first time the database is empty, all with the password `password123`:
  - `admin@mizanbooks.com` (administrator)
  - `accountant@mizanbooks.com` (accountant)
  - `viewer@mizanbooks.com` (viewer)
- The sign-in screen starts with that email and password already filled in (`src/components/LoginView.tsx`, lines 24–25). The “add a user” form in settings does the same (`src/components/modules/SettingsModule.tsx`, line 62).

Those demo users are created by `seedIfEmpty()`, which runs from `getDb()`. The health check calls `getDb()` (`src/app/api/health/route.ts`). So the first health check on a new server creates the demo companies and the `password123` accounts.

`ENABLE_DEMO_LOGIN=false` only hides the one-click demo buttons (`src/lib/auth.ts`, lines 13–15, and the `demoEmail` branch in `src/app/api/auth/login/route.ts`). The normal email-and-password login still accepts `admin@mizanbooks.com` / `password123`. Following `.env.example` turns the buttons off. It does not remove the accounts.

### How login and sessions work

Passwords are not stored in plain text. They are hashed with scrypt and a random salt (`src/lib/auth.ts`, `hashPassword` / `verifyPassword`), and the comparison is timing-safe. That part is sound.

A successful login sets an HTTP-only cookie named `mizan_session` for 30 days, and also returns the same token in the JSON response for the phone app. The cookie is marked `SameSite=lax`. It is marked `Secure` only when `COOKIE_SECURE=true` or the request carries `X-Forwarded-Proto: https`.

The token is a signed user id plus a timestamp. Nothing checks that timestamp. Logout (`src/app/api/auth/logout/route.ts`) deletes the browser cookie and does nothing else. There is no session list on the server, so:

- a stolen token keeps working after logout
- the phone token in `mobile/src/api.ts` stays valid until the phone deletes it
- anyone who knows the session secret can mint a token for any user id, including the administrator

There is no limit on how many times someone can try a password, and no email confirmation on sign-up. Sign-up is open to anyone who can reach the server (`src/app/api/auth/signup/route.ts`). The password only has to be 6 characters. Every new sign-up becomes the administrator of a new company.

### Access between users and companies

Most screens do check membership. `resolveScopedCompanyId()` in `src/lib/api-helpers.ts` refuses a company id the user is not linked to in the `company_users` table, and the list/create routes for invoices, bills, customers, vendors, journals, payroll, inventory, and reports use that helper. A viewer’s role cannot post (`canWrite` allows only `admin` and `accountant`).

Two gaps matter:

1. **The role that is enforced is the single role on the user, not the role stored per company.** `getCurrentUser()` reads `users.role`. `company_users.role` is saved and shown in Settings, but the permission checks do not read it. A person cannot be an administrator of one company and a viewer of another. Today the two columns are written together, so this is a design trap more than a hole in the sample data.

2. **Journal lines do not have to belong to the company on the journal.** `postJournalEntry()` in `src/lib/accounting.ts` checks that the line amounts balance. It does not check that each account id belongs to `company_id`. The same missing check applies to the expense account on a bill (`src/app/api/bills/route.ts`) and to the cash account on an invoice or bill payment (`src/app/api/invoices/[id]/pay/route.ts` and `src/app/api/bills/[id]/pay/route.ts`), because those routes pass the caller’s account id straight through.

This was tried on a temporary database, outside the project, using the app’s own posting function:

- A journal for company 1 whose both lines used company 2’s accounts was **saved**. Neither company’s trial balance changed. The entry exists in the database and does not show up in either set of books.
- A journal for company 1 that debited company 1’s cash by 250 and credited a company 2 equity account by 250 was **saved**. Company 1’s trial balance then differed by 249.99, and the report’s “balanced” flag turned off.

Account numbers are easy to guess because they are assigned in order. A person who can post to one company can aim a line at another company’s account.

### Input checks

Required names and “at least one line” are checked. Amounts that are negative, or a line that is both a debit and a credit, are rejected by `postJournalEntry()`. A non-numeric amount was rejected in the test (it was treated as an empty line).

These are not checked:

- that a date is a real date
- that an exchange rate is a sensible positive number when the caller supplies one (a custom rate is trusted)
- that a payment account or a bill’s expense account belongs to that company
- email format, beyond “not empty”
- the language value saved by `PATCH /api/auth/me` (any string is stored)

Several routes answer failures with the raw error text, including database errors (`String(err)` in the login, accounts, companies, inventory, and billing routes). That text can describe the database to a stranger.

### Dependency vulnerabilities

`npm audit` after `npm ci` reported **2 vulnerabilities: 1 high, 1 moderate**. Both are in PostCSS, the CSS tool, and the copy npm is worried about is the one **inside Next.js** (`next@15.5.29` depends on `postcss@8.4.31`). The app’s own direct PostCSS is 8.5.33.

The advisories are about PostCSS being tricked, while it is reading untrusted CSS, into reading local files or emitting unsafe markup. This app does not accept CSS from users. That makes the practical risk low for Mizan Books. It is still a reason to upgrade Next.js before the app sits on the internet for a long time. npm’s suggested fix is a major upgrade (it offered Next 16), so it needs a careful test, not a blind update. The phone app was not audited because its packages were not installed.

### CORS and HTTPS

`next.config.ts` sends `Access-Control-Allow-Origin` from `ALLOWED_ORIGIN`, which defaults to `*`. Compose does the same. The web app itself is same-origin and uses a cookie, so a wildcard is mainly there for the phone app. A public site should name its real address instead.

The app listens on plain HTTP. These headers are set, which is good: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a strict-origin referrer policy. There is no `Strict-Transport-Security` header and no Content-Security-Policy. The secure-cookie flag trusts `X-Forwarded-Proto`. If the site is reachable as `http://` on port 3000, the login cookie can travel without the secure flag. `DEPLOY.md` says to put a proxy in front. Nothing in Compose does that for you.

---

## 4. Accounting correctness

Double-entry means every saved journal has two sides, debits and credits, and those sides must be equal. Mizan Books tries to do this in `postJournalEntry()` (`src/lib/accounting.ts`).

What it does well:

- It refuses an entry with fewer than two non-zero lines.
- It refuses a negative amount, and a line that carries both a debit and a credit.
- It adds the two sides up and rejects a gap **larger than 2 cents**.
- On a fresh temporary database, every seeded journal was balanced to the cent. Company 1’s trial balance was 5,588,925 on each side. Company 2’s was 272,250 on each side. Both balance sheets matched, and the report flagged them balanced. The seeded October 2026 payroll journal was 128,590 on each side.
- The sample export invoice (`INV-2026-004`, 2,800 US dollars at 124.5) was posted to the Ethiopian company’s books as 348,600 birr on both sides. That conversion is right for the rate stored on the invoice.

What is not safe enough for real books:

### Debits are allowed to differ from credits

The server rejects a gap only when it is **greater than 0.02** (`src/lib/accounting.ts`, line 62). A test entry of debit 100.00 and credit 100.01 was **saved**. The trial-balance screen still says “balanced” when the two grand totals differ by **less than 5 cents** (lines 240 and 262). After that one-cent entry, the totals were 5,589,025.00 and 5,589,025.01 and the flag stayed “balanced.”

The journal screen is stricter than the server: it requires the gap to be under 1 cent (`src/components/modules/JournalEntriesModule.tsx`, line 85). The API, which the phone app and any script can call, allows the wider gap. Many one-cent entries can add up.

### Money is stored as floating-point, not as whole cents

Journal debits and credits, invoice totals, tax, payroll, and exchange rates are SQLite `REAL` columns (`src/lib/db.ts`, for example the `journal_lines` table around lines 407–411) and JavaScript `number` values. That format cannot represent every decimal exactly. Two illustrations measured during this review:

- `0.1 + 0.2` is `0.30000000000000004`, not `0.3`
- `(1.005).toFixed(2)` is `"1.00"`, so a price of 1.005 can be stored as 1.00

The code rounds with `toFixed(2)` in many places, which hides the problem until a total is a cent off. Somali shillings are displayed with no decimals (`src/lib/currency.ts`) but are still stored and rounded like a two-decimal currency. There is no integer-cents (or decimal) type anywhere.

### Multi-currency is partial

A foreign invoice keeps its currency, rate, and foreign total on the invoice row. The journal is posted in the company’s home currency, which is the right idea. The journal line itself does not remember the foreign currency: `postJournalEntry()` stores the home currency, an exchange rate of 1, and a “foreign amount” equal to the home-currency amount, unless the caller overrides them. The sample export journal confirms this: the lines say ETB, rate 1, foreign amount 348,600, while the invoice says USD 2,800 at 124.5.

Rates are a single number per currency, seeded from a hard-coded table in `seedCompanyExchangeRates()` (for example 1 USD = 124.5 ETB) and editable later by an administrator. There is no history by date. Paying a foreign invoice multiplies by the rate saved on the invoice. There is no exchange-gain or exchange-loss account when the rate has moved.

Item costs used for cost of goods sold are not multiplied by the invoice rate. That is correct only when the item’s cost is already in the company currency. Items have no currency of their own.

A caller who sends their own `exchange_rate` on an invoice or bill is trusted.

### Posted entries cannot be edited or deleted through the app

There is no API to update or delete a journal, an invoice, or a bill. The only `PATCH` routes are inventory quantity and the user’s language/calendar. Payments add a **new** journal and update the amount paid. They do not rewrite the original lines. The journal screen has no edit or delete control for a saved entry.

That is the right instinct. The limits are:

- Nothing in the database stops a person who can open `mizan.db` from changing rows. There are no database triggers.
- There is no void and no guided reversing entry. A correction is a new journal the user types by hand.
- Deleting a company row would delete its journals, because the schema uses `ON DELETE CASCADE`. The app has no “delete company” button, so this only matters if someone edits the file.
- Creating an inventory item with a starting quantity does not post a journal (`src/app/api/inventory/route.ts`). The stock count and the inventory account can disagree from day one.
- An invoice reduces stock **before** the journal and the invoice row are saved, and those steps are not wrapped in one database transaction. If the journal is rejected, the quantity can already have changed.
- Payroll can be posted twice for the same month. Nothing unique blocks a second run, and each run pays the staff again.
- Invoice and journal numbers are “how many rows exist, plus one” (`nextSequenceNumber()`). There is no uniqueness rule on the number. The sample data happens to be numbered cleanly.

### Tax figures

Ethiopian employment-income brackets, a simplified Somalia scale, and zero personal income tax for the UAE, Saudi Arabia, and the exempt regime are hard-coded in `calculateIncomeTax()` (`src/lib/accounting.ts`). Ethiopian payroll also uses 7% employee and 11% employer pension. This review did **not** compare those brackets with the current proclamation. Treat them as a starting sketch, not as a filing you can send to a tax office, until an accountant has checked them.

The 30-day trial is a date on the company and a label on the screen (`src/components/AppContext.tsx`). No API refuses work after the trial ends. `POST /api/billing` lets a company administrator set the plan to Business or Enterprise and the status to active. No payment is taken.

---

## 5. Production basics

| Topic | What is in the project | What a launch still needs |
| --- | --- | --- |
| Production vs development | The image sets `NODE_ENV=production`. There is no debug flag left on. The dangerous defaults are the session secret, the demo users, and demo login being on unless it is exactly `false`. | Refuse to start in production when the secret is missing or is one of the published phrases. Do not create `password123` users unless a person explicitly asks for demo data. |
| Database changes | On startup the app runs `CREATE TABLE IF NOT EXISTS` and a few `ALTER TABLE` steps for the trial columns (`src/lib/db.ts`). | A numbered migration history, so a future change cannot half-apply. The current approach is enough for a first empty file and is fragile after that. |
| Backups | `DEPLOY.md` shows a `sqlite3 .backup` command to run by hand. WAL mode is turned on, which is the right mode for that command. | A daily job that actually runs, and a tested restore. Nothing in Compose or the app does this. |
| Logging and errors | One `console.warn` for the default secret. Failures are returned to the browser as text. There is an `audit_logs` table for business actions (create invoice, post journal, and so on). | A log that stays on the server, without showing SQL errors to the visitor. The audit log can be changed by anyone who can open the database file. |
| Health check | `GET /api/health` runs `SELECT 1` and returns `{ "status": "ok" }`. The Dockerfile checks it every 30 seconds. | Keep the check. Be aware that calling it on an empty disk also creates the demo companies and the `password123` users, because it opens the database. |
| One copy of the app | SQLite is one file. Compose starts one container. | Do not run two copies against the same file. They will fight over writes. This setup does not scale out by adding servers. |
| Languages and right-to-left | All five language files are typed as the same dictionary (`src/lib/i18n/en.ts`, `am.ts`, `om.ts`, `so.ts`, `ar.ts`). The type-check passed, so every phrase exists in every language. Arabic is marked `dir: "rtl"`. When the language changes, `src/components/AppContext.tsx` sets the page’s `dir` and `lang`. Amharic and Arabic fonts are loaded from Google Fonts in `src/app/layout.tsx`. | This was confirmed from the code and the type-check. The screens were not clicked in a browser during this review, so the layout was not watched flipping with human eyes. A locked-down server must be allowed to reach `fonts.googleapis.com`, or the fonts need to be hosted with the app. |
| HTTPS | Documented as “put Caddy or Nginx in front.” | The proxy is not included. Set `COOKIE_SECURE=true` once HTTPS is in place. |

---

## 6. What a real deployment still needs

These pieces **are already here**, and they are the right kind of pieces:

- `Dockerfile` and `docker-compose.yml`
- `.env.example`
- `DEPLOY.md`
- a health check
- `.gitignore` rules for `.env` and the database
- hashed passwords, an HTTP-only cookie, and company membership checks on the main screens
- sample books that balance
- no in-app edit or delete of a posted journal

These pieces are **missing or only described, not done**:

- a way to start a real company without also creating the demo logins
- a hard stop when the session secret is still a sample value
- automatic backups and a restore test
- automated tests (there are zero)
- a working lint setup (ESLint is not installed)
- a continuous-integration workflow (there is no `.github` folder)
- a root README in plain language (`DEPLOY.md` assumes comfort with OpenSSL, volumes, and a reverse proxy; `mobile/README.md` covers only the phone app)
- HTTPS in the Compose file
- versioned database migrations
- a Node version pin in `package.json` (`engines`), so a host does not silently use a Node that lacks `node:sqlite`
- a lockfile and an EAS config for the phone app (`DEPLOY.md` tells you to run `npx eas-cli build`, and there is no `eas.json`)
- the phone app’s default server is `http://localhost:3000` or `http://10.0.2.2:3000` (`mobile/src/api.ts`)

The Docker image also copies the full `node_modules` folder from the build, including development packages, and it does not set `MIZAN_SESSION_SECRET` or `ENABLE_DEMO_LOGIN`. Those have to be supplied at run time. They are not supplied safely by the Compose defaults.

---

## Must fix before launch

Do these before any real company’s records are reachable on the internet.

1. **Stop creating the public demo logins on a real server.** Every empty database gets `admin@mizanbooks.com`, `accountant@mizanbooks.com`, and `viewer@mizanbooks.com` with password `password123` (`src/lib/db.ts`). Turning off the demo buttons does not disable those passwords (`src/app/api/auth/login/route.ts`). The health check is enough to create them. Seed demo data only when someone explicitly opts in, and never on a server that holds real books.

2. **Refuse to boot with a sample session secret.** `src/lib/auth.ts` falls back to `mizan-accounting-local-dev-secret-v1` and only warns. `docker-compose.yml` falls back to `change-me-to-a-64-char-random-secret`, and the warning does not even look for that second phrase. With either phrase, a stranger can forge an administrator login. Generate a secret with `openssl rand -hex 32`, require it in production, and remove both fallbacks.

3. **Make every journal line use an account from the same company.** `postJournalEntry()` does not check this. A test proved a cross-company entry can be saved and either vanish from both trial balances or throw one company out of balance. Apply the same check to bill expense accounts and to the cash account on a payment.

4. **Store money as whole cents (or a true decimal), and reject any journal whose sides are not exactly equal.** Today amounts are floating-point `REAL` / JavaScript numbers, a 1-cent or 2-cent gap is saved, and the trial balance still says “balanced” below a 5-cent gap (`src/lib/accounting.ts`, `src/lib/db.ts`). That will drift on real invoices.

5. **Back up the database automatically, and try a restore once.** The books are one file. `DEPLOY.md` only shows a command. A disk failure with no backup is a total loss. Run one copy of the app against that file.

## Should fix soon

6. **Make login sessions expire, and make logout actually end them.** The cookie lasts 30 days, the token’s timestamp is ignored, and logout only deletes the cookie. A stolen phone token works until you change the secret.

7. **Decide what the trial and the paid plans mean, then enforce it.** The trial date is a label. Any administrator can mark the company as a paid plan in `src/app/api/billing/route.ts` without paying. If sign-up stays public, add a way to turn it off, confirm email addresses, and slow down repeated password guesses. Six characters is a weak minimum.

8. **Use the per-company role.** `company_users.role` is stored and displayed. The lock uses `users.role` only (`src/lib/api-helpers.ts`, `src/lib/auth.ts`).

9. **Wrap invoice, stock, and journal writes in one database transaction**, and do the same for bills and payroll. Today a failed invoice can still change the quantity on hand.

10. **Finish multi-currency.** Keep the original currency and rate on the journal line, keep a dated rate history, and post an exchange gain or loss when a foreign invoice is paid at a different rate. Do not trust a caller-supplied rate without a check. State clearly that item costs are in the company currency.

11. **Stop inventory and the accounts drifting apart.** Post an opening journal when a product is created with a starting quantity. Stop the same payroll period from being run twice. Put a uniqueness rule on invoice, bill, and journal numbers.

12. **Hide internal errors.** Return a short message to the browser. Keep the database detail in a server log. Add a real logger. The audit log is a good start for business events.

13. **Lock down the edges of the network.** Set `ALLOWED_ORIGIN` to the real site address. Put HTTPS in front before launch, and set `COOKIE_SECURE=true`. Add a strict-transport header once HTTPS is on.

14. **Upgrade the Next.js / PostCSS pair** after reading the PostCSS advisories. `npm audit` reported 1 high and 1 moderate, both in the PostCSS copy inside Next 15.5.29. This app does not take CSS from users, so this is not an open door into the books, but a public server should not sit on a known high advisory forever.

15. **Add tests before the next change to journals, invoices, tax, or login.** There are zero tests today, so none of the failures above would be caught by a command. At least cover: equal debits and credits, cents instead of floats, a user who must not see another company, and “production refuses the demo password.”

16. **Make lint run.** `npm run lint` exits 1 because ESLint was never set up. Add it as a real development dependency when you are ready to change the project. It was not added in this review.

17. **Have an accountant check the tax brackets** in `calculateIncomeTax()` before anyone files a return from these numbers.

18. **Give the phone app a lockfile and a real server address** before building store binaries. It currently targets `http://localhost:3000`.

## Nice to have

19. A short root README in everyday language: what the app is, how to start it, and the rule “set a secret, turn demo data off, put HTTPS in front, back up the file.”

20. A continuous-integration workflow that runs the type-check, the build, and the tests on every change.

21. A Content-Security-Policy header, and hosting the Ethiopic and Arabic fonts with the app so a private network does not depend on Google.

22. Password reset, and a guided “reverse this entry” action so corrections stay obvious. Posted rows should stay immutable.

23. A period lock, so a closed month cannot receive new journals.

24. A Node `engines` field set to Node 24, matching the Dockerfile, and a slimmer image that omits development packages.

25. `eas.json` for the phone app, so the store-build command in `DEPLOY.md` has a config to read.

---

## Bottom line

The project is a coherent first version. It installs, it type-checks, and it builds. The sample companies balance, posted journals cannot be quietly edited in the app, and the deployment files a host would look for are mostly present.

**Not yet** for a public launch with real books. Fix the demo passwords, the session secret, the cross-company journal lines, the way money is stored, and backups first. Then add tests around those rules so they stay fixed.
