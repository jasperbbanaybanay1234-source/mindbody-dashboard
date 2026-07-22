# Mindbody Operations Dashboard

An internal staff dashboard for gyms running Mindbody. Built with Vite + React, deployed on Netlify with serverless functions.

## Features

- **Operations** — Red's list (inactive members), no-shows with class details, suspensions, fringe members, upcoming birthdays & anniversaries
- **Finances** — Failed/declined payments (deduplicated retries), on-account balances, declined memberships; mark payments as Reconciled or Reprocessed
- **Onboarding** — Week-by-week pipeline for new members with at-risk flagging and rollover decisions
- **Personal Training** — Session counts, unchecked sessions, client attendance trends

---

## Prerequisites

- [Mindbody](https://www.mindbodyonline.com) account with API access
- [Netlify](https://netlify.com) account (free tier works)
- [Notion](https://notion.so) account (for contact log, payment resolutions, and rollover decisions)
- Node.js 18+

---

## Setup

### 1. Fork / clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/mindbody-dashboard.git
cd mindbody-dashboard
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

See the [Environment Variables](#environment-variables) section below for details on each value.

### 3. Set up Notion databases

You need four Notion databases. Create each one, then share it with your Notion integration (the connection created when you generated your `NOTION_TOKEN`).

#### Clients (CRM)
Your main client database. Required fields:
| Field | Type |
|---|---|
| Full Name | Title |
| Mindbody ID | Text |
| Email | Email |
| Phone | Phone |
| Relationship | Multi-select (option: `Client`) |
| Last Check-In | Date |

#### Contact Log
Tracks staff–client contact history.
| Field | Type |
|---|---|
| Entry | Title |
| Mindbody ID | Text |
| Client Name | Text |
| Note | Text |
| Contacted At | Date |
| Client | Relation → Clients |

#### Onboarding Rollover Decisions
Tracks whether onboarding clients roll over to a full membership.
| Field | Type |
|---|---|
| Mindbody ID | Title |
| Rollover | Select (options: `Rollover`, `No Rollover`) |
| Date | Date |
| Client | Relation → Clients *(optional)* |

#### Payment Resolutions
Tracks reconciled or reprocessed failed payments.
| Field | Type |
|---|---|
| Payment Key | Title |
| Client Name | Text |
| Amount | Number |
| Card | Text |
| Payment Date | Text |
| Status | Select (options: `Reprocessed`, `Reconciled`) |
| Resolved At | Date |

Once each database is created, copy its ID from the URL:
`https://notion.so/yourworkspace/{DATABASE_ID}?v=...`

### 4. Deploy to Netlify

**Option A — Netlify UI (recommended):**
1. Push your repo to GitHub
2. In Netlify: New site → Import from Git → select your repo
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add all environment variables under **Site configuration → Environment variables**

**Option B — Netlify CLI:**
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:import .env
netlify deploy --prod
```

### 5. Local development

```bash
netlify dev
```

This runs the Vite dev server and Netlify Functions together on `http://localhost:8888`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MINDBODY_API_KEY` | Yes | From [developers.mindbodyonline.com](https://developers.mindbodyonline.com) |
| `MINDBODY_SITE_ID` | Yes | Your Mindbody studio ID (positive integer for production) |
| `MINDBODY_USERNAME` | Yes | Staff account username used for API token generation |
| `MINDBODY_PASSWORD` | Yes | Staff account password |
| `NOTION_TOKEN` | Yes | `ntn_...` token from your Notion internal integration |
| `NOTION_CLIENTS_DB` | Yes | Notion database ID for your Clients / CRM database |
| `NOTION_CONTACT_LOG_DB` | Yes | Notion database ID for the Contact Log database |
| `NOTION_ROLLOVER_DB` | Yes | Notion database ID for Onboarding Rollover Decisions |
| `NOTION_PAYMENT_RESOLUTIONS_DB` | Yes | Notion database ID for Payment Resolutions |
| `VITE_BUSINESS_NAME` | No | Your gym's name — shown in the dashboard header and used in onboarding script templates. Defaults to "Your Gym". |

> **Security tip:** Create a dedicated read-only Mindbody staff account for the API credentials rather than using an admin account.

---

## Customizing for your gym

Beyond the environment variables above, a few things are baked into the code as example content and business rules — edit them to match your own program:

- **`src/utils/onboardingTasks.js`** — the 18 onboarding task scripts (texts, calls, bingo card criteria, reward). These reflect one gym's onboarding process; rewrite the copy to match yours.
- **`src/components/Dashboard.jsx`** — `SHORT_PRODUCTS` defines which Mindbody product names are treated as short-term trials rather than full memberships. Update the set to match your own product names.

---

## Mindbody API notes

- Requires Mindbody API v6 access (contact Mindbody support to enable)
- Uses staff token auth — credentials are never sent to the client
- Client batch lookups are capped at 20 IDs per request (Mindbody limit)
- A daily scheduled function caches attendance, revenue, client analytics, and payments to reduce API costs

---

## Tech stack

- **Frontend:** Vite, React 18, Tailwind CSS
- **Backend:** Netlify Functions (ESM, esbuild)
- **Data:** Mindbody Public API v6, Notion API
- **Hosting:** Netlify
