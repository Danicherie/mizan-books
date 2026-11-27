# Changelog

## Unreleased

### Finance suite on the current books

- Bank reconciliation, budgets and cash flow, point of sale, receipt photos, payslips, tax filings, and customer alerts now sit on the same books as the trial lock, whole-cent money, and the cosy amber and cream screens.
- New money columns are integer cents. New saves check the browser origin, the company role, and the trial or pause lock.
- Online subscription checkout and the invented prices are gone. A test payment can be marked complete only when `ENABLE_SANDBOX_PAYMENTS=true`. The payments tab stays hidden until that switch is on.
- Receipt photos are checked as real JPEG, PNG, or WebP files. The daily backup copies `data/receipts` next to the database snapshot.
- Optional settings, left empty unless you use them: `ENABLE_SANDBOX_PAYMENTS`, `CHAPA_SECRET_KEY`, `STRIPE_SECRET_KEY`, `APP_URL`, `TELEGRAM_BOT_TOKEN`, `SMS_WEBHOOK_URL`, `SMS_API_KEY`.

### Small-business books

- Supplier bills already on file now show aged payables, and the dashboard lists bills due in the next seven days.
- Receiving stock at a new cost updates the moving average cost in cents and posts that receipt to the ledger.
- Exchange rates can be saved for a chosen date. A foreign invoice or bill is converted at the rate on its date, and the payment posts the realised gain or loss against account 4200. Pound sterling is included with the other currencies.
- Company roles are owner, accountant, staff, and viewer. Staff can sell, buy, and count stock. The ledger, payroll, budgets, and the audit log stay with the owner and the accountant. An owner can invite someone who already has a login.

### Languages and legal pages

- Amharic, Afaan Oromo, and Somali now cover the marketing site, the About, Contact, Privacy, and Terms pages, and the messages the app shows when a save or sign-up is rejected. English and Arabic use the same finished pages.
- The Privacy Policy and Terms of Service are no longer drafts. They name the operator, Daniel Fessehaye in London, and were last updated on 25 November 2026. They do not invent an email address, a phone number, or a company number.
- The contact form saves a message in the database. It is rate limited, checks the browser origin, and ignores a hidden field that people do not fill in. The operator reads, marks, or deletes those messages on `/admin`.
- If `CONTACT_EMAIL` is set, that address is shown on the Contact page. It is optional. The form does not send mail.

### Free trial and subscription

- Every company now has a 30-day free trial from the day it is created.
- Companies that already existed get a 30-day trial starting the first time this version opens the database. A company that is already paid is left alone. This happens once.
- During the trial, the books show how many days are left.
- When the trial has ended, or the company is paused, people can still sign in, look through the books, and export reports. They cannot create, edit, or delete anything. That limit is enforced on the server.
- The page that explains this asks them to contact the owner of Mizan Books to subscribe. There is no card payment in this version.
- The signed-in books stay at `/app`. The public pages at `/`, `/about`, `/contact`, `/privacy`, and `/terms` do not ask for a login.

### Owner page

- `/admin` is a separate page for the person who runs Mizan Books. It is not a company login.
- It stays off until `OPERATOR_PASSWORD` is set on the server. There is no default password.
- From that page you can see each company, extend a trial, mark a company paid until a date, and pause or unpause it. Each of those actions is written to an audit log.
- The same page shows whether the database is reachable and which version is running.
- Marking a company paid is one function (`setPaidUntil`). A future card payment can call that function. Company users cannot mark themselves paid.

### Security

- Sign-in, sign-up, and the owner login are rate limited.
- Public sign-up can be turned off with `SIGNUP_ENABLED=false`.
- Passwords for new users must be at least 8 characters and cannot be a published sample password.
- Changes that use the login cookie are rejected when the browser origin does not match `ALLOWED_ORIGIN` (or the same host, when that setting is `*`).
- A company user can only read and change that company's records.
- Error messages shown in the browser no longer include database details.
- The site sends stricter browser headers, including a content security policy that still allows the public pages, Google Fonts, and the in-page language script.
