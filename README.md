# Maxwell Properties Management 🏠

A full-stack property management application for tracking and managing all your rental properties in one place.

## Properties Managed

| Property | Type | Location |
|----------|------|----------|
| Rented House | Long-term Rental | Nairobi |
| Mombasa Airbnb | Short-term / Vacation | Mombasa |
| Ruai Apartment | Long-term Rental | Ruai, Nairobi |

## Features

- **📊 Dashboard** — Overview of all properties, revenue charts, and quick stats
- **🏘️ Property Management** — Add, edit, and track properties
- **👤 Tenant Management** — Manage tenants and Airbnb guests
- **💰 Payment Tracking** — Record and track rent payments (KES)
- **🔧 Issue Tracker** — Log and resolve maintenance issues
- **🔎 Quick Search & Filters** — Find properties and tenants quickly
- **✏️ Record Corrections** — Edit payments and maintenance issues when details change
- **🔐 Secure Authentication** — JWT-based login with bcrypt password hashing
- **👥 Manager Access** — Admins can create, activate, and deactivate manager accounts
- **🔑 Google Sign-In** — Optional Google Identity Services login for approved accounts
- **🏢 House Units** — Apartment-only House IDs with unit rent, water billing, occupancy, and maintenance status
- **✅ Approval Workflow** — Manager changes to sensitive records wait for admin review and discussion
- **🧾 Expenses & Net Income** — Repairs and general operating costs are tracked as deductions
- **📨 Notifications** — Payment receipts, onboarding messages, overdue broadcasts, and scheduled reminders

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Recharts
- **Backend:** Node.js, Express, SQLite
- **Auth:** JWT + bcrypt

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

### Installation

```bash
# 1. Navigate to the project
cd maxwell-properties-management

# 2. Install all dependencies (root + server + client)
npm run install:all

# 3. Start the development servers
npm run dev
```

This will start:
- **Backend API** on `http://localhost:5000`
- **Frontend App** on `http://localhost:5173`

The frontend uses a Vite proxy for `/api` during development, so it also works if Vite selects another available port. If the API is hosted separately, copy `client/.env.example` to `client/.env` and set `VITE_API_URL` to the API base URL.

### Separate admin and manager portals

The login screen has two explicit portals: **Landlord (Admin)** and **Manager Portal**. The selected portal is checked by the API, so a manager account cannot authenticate through the admin portal even when the password is correct. After sign-in, admins use `/admin` and managers use `/manager`; the server also protects manager administration endpoints with an admin-only role check.

Sign in as the administrator, open **Managers**, and create a manager account. Managers can work with the day-to-day property workspace but cannot create, activate, deactivate, or edit manager accounts. Deactivated managers cannot sign in, and existing sessions are rejected after deactivation.

Managers may report maintenance issues and record payments directly. Changes to properties, House Units, tenants, expenses, and existing maintenance records are submitted to **Approvals** for an administrator to review, discuss, approve, or reject.

For an **Apartment**, add each House Unit first. A unit must be `Ready for Occupation` and vacant before it appears in the tenant allocation dropdown. Airbnb properties do not show House IDs, unit tracking, or apartment tenant messaging controls.

### Manager accounts and Google sign-in

To enable Google sign-in, create a Google Identity Services web client ID, add it as `GOOGLE_CLIENT_ID` for the API and `VITE_GOOGLE_CLIENT_ID` for the frontend, then add your local and deployed app origins in the Google client configuration. Google sign-in is limited to existing Maxwell user accounts; an administrator must create the account first.

Email and SMS delivery use an outbox table so a missing provider does not interrupt payment recording. Configure Resend with `RESEND_API_KEY` and `EMAIL_FROM`, and/or Twilio with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`. Until configured, jobs are recorded as failed with a clear provider error for later setup.

To enable the daily month-end reminder check, set `ENABLE_AUTOMATIC_REMINDERS=true` and optionally change `REMINDER_DAY_OF_MONTH` and `REMINDER_MESSAGE`.

New or changed passwords must be 6–20 characters and include a lowercase letter, an uppercase letter, a number, and a symbol.

### Production security configuration

In production, configure four different signing secrets: `ADMIN_JWT_SECRET`, `MANAGER_JWT_SECRET`, `ADMIN_JWT_REFRESH_SECRET`, and `MANAGER_JWT_REFRESH_SECRET`. The API refuses to start when they are missing. Use long, random values, keep them server-side, and rotate them during a planned session reset. `JWT_SECRET` and `JWT_REFRESH_SECRET` remain local-development fallbacks only.

### First administrator

Local development creates a convenience administrator account when the database is empty. Production does not create a publicly known default account: set `INITIAL_ADMIN_EMAIL` and a strong `INITIAL_ADMIN_PASSWORD` before starting a new production database. The password must be 6–20 characters and include a lowercase letter, an uppercase letter, a number, and a symbol. Keep both values private and remove the bootstrap password from the deployment environment after the first administrator has been created.

## Project Structure

```
maxwell-properties-management/
├── package.json          # Root scripts
├── .env                  # Environment variables
├── server/               # Express.js backend
│   ├── src/
│   │   ├── index.js      # Server entry point
│   │   ├── database.js   # SQLite setup & seed data
│   │   ├── middleware/    # Auth middleware
│   │   └── routes/       # API routes
│   └── data/             # SQLite database file
└── client/               # React frontend
    └── src/
        ├── pages/        # Page components
        ├── components/   # Shared UI components
        ├── contexts/     # Auth context
        └── api/          # API client
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/health` | Check API availability |
| GET/POST/PUT/DELETE | `/api/managers` | Admin-only manager account management |
| GET/POST/PUT/DELETE | `/api/properties` | Property CRUD |
| GET | `/api/properties/stats` | Dashboard statistics |
| GET/POST/PUT/DELETE | `/api/tenants` | Tenant CRUD |
| GET/POST/PUT/DELETE | `/api/payments` | Payment CRUD |
| GET | `/api/payments/summary` | Payment summary |
| GET/POST/PUT/DELETE | `/api/issues` | Issue CRUD |
| GET/POST/PUT/DELETE | `/api/units` | Apartment House Unit CRUD and available-unit list |
| GET/POST/PUT/DELETE | `/api/expenses` | Property and unit expense CRUD |
| GET | `/api/approvals` | Admin queue or manager's own approval requests |
| POST | `/api/approvals/:id/comments` | Discuss an approval request |
| POST | `/api/approvals/:id/decision` | Admin approve or reject a request |
| GET | `/api/notifications/jobs` | Outbound notification history |
| POST | `/api/notifications/overdue` | Queue a custom message for overdue tenants |
| POST | `/api/notifications/month-end` | Queue a custom message for active tenants |

## Security

- Passwords hashed with bcrypt (12 rounds)
- JWT access tokens (1-hour expiry)
- JWT refresh tokens (7-day expiry)
- Rate limiting on password and Google login endpoints
- Explicit CORS origin allowlist
- Helmet.js security headers
- Parameterized SQL queries (injection prevention)
- Separate admin and manager token signing keys in production
- Live account status and role checks on every authenticated request

## License

MIT

