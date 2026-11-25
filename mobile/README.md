# Mizan Books Mobile (iOS & Android — Expo React Native)

Native iOS & Android companion app for **Mizan Books**, connected directly to the Next.js accounting backend via Bearer token authentication.

## Features
- **5 Languages + Arabic RTL**: English, Amharic (`አማርኛ`), Afaan Oromo, Somali, and Arabic (`العربية`).
- **Gregorian & Ethiopian Calendar** toggle.
- **30-Day Free Trial Sign-Up** & Sign-In + Instant Admin Demo.
- **Dashboard KPIs**, **Invoices (with 1-tap Mark Paid)**, **Bills**, **Profit & Loss / Balance Sheet**, and **Multi-Company Switcher**.

## Running on Your Phone (iOS & Android)
1. Start the Mizan Books backend in the project root:
   ```bash
   npm run dev
   ```
2. Install mobile dependencies and launch Expo:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
3. Scan the QR code with **Expo Go** (iOS / Android). If testing on a physical phone, set the **API Server URL** field on the login screen to your computer's LAN IP (e.g., `http://192.168.1.101:3000`).
