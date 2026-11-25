# Changelog

## Unreleased

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
