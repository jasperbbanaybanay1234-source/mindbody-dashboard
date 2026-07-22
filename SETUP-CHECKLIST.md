# Mindbody Dashboard — Setup Checklist

A step-by-step checklist for getting your own copy of this dashboard running. See `README.md` in this folder for full details on each step (Notion field schemas, deployment options, etc).

## 1. Mindbody API access

- [ ] Sign up for a developer account at [developers.mindbodyonline.com](https://developers.mindbodyonline.com)
- [ ] Request API v6 access for your site (contact Mindbody support if it's not already enabled)
- [ ] Note your **Site ID** (found in your Mindbody account/business settings)
- [ ] Create a **dedicated staff account** for API access — don't use an admin login. Give it read-only permissions if possible
- [ ] Generate an **API key** from the developer portal

## 2. Notion setup

- [ ] Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and copy the token (`ntn_...`)
- [ ] Create 4 Notion databases (see `README.md` for exact required fields in each):
  - [ ] **Clients** (your CRM)
  - [ ] **Contact Log**
  - [ ] **Onboarding Rollover Decisions**
  - [ ] **Payment Resolutions**
- [ ] Share each database with your integration (••• menu → Connections → add your integration)
- [ ] Copy each database's ID from its URL (`notion.so/yourworkspace/{DATABASE_ID}?v=...`)

## 3. Get the code running locally

- [ ] Install [Node.js](https://nodejs.org) 18+
- [ ] Unzip/clone the project and run `npm install`
- [ ] Run `cp .env.example .env`
- [ ] Fill in `.env` with:
  - [ ] `MINDBODY_API_KEY`
  - [ ] `MINDBODY_SITE_ID`
  - [ ] `MINDBODY_USERNAME` / `MINDBODY_PASSWORD` (your dedicated staff account)
  - [ ] `NOTION_TOKEN`
  - [ ] `NOTION_CLIENTS_DB`, `NOTION_CONTACT_LOG_DB`, `NOTION_ROLLOVER_DB`, `NOTION_PAYMENT_RESOLUTIONS_DB`
  - [ ] `VITE_BUSINESS_NAME` (your gym's name — shown in the header)
- [ ] Run `npm install -g netlify-cli` (if not already installed)
- [ ] Run `netlify dev` and confirm the dashboard loads at `http://localhost:8888` with your real data

## 4. Deploy it

- [ ] Push the code to your own GitHub repo
- [ ] Create a free [Netlify](https://netlify.com) account
- [ ] New site → Import from Git → select your repo
- [ ] Build command: `npm run build` / Publish directory: `dist` (should auto-detect from `netlify.toml`)
- [ ] Add every variable from your `.env` under **Site configuration → Environment variables**
- [ ] Deploy, then open the live URL and confirm data loads

## 5. Make it yours

- [ ] Edit `src/utils/onboardingTasks.js` — rewrite the 18 onboarding task scripts (texts/calls/bingo card) to match your own onboarding process
- [ ] Edit `SHORT_PRODUCTS` in `src/components/Dashboard.jsx` — update to match your own Mindbody product names for trial/short-term memberships
- [ ] Double check `MINDBODY_SITE_ID` — negative IDs are sandbox, positive is production

## Notes

- Never commit your `.env` file or share your Mindbody/Notion credentials
- If something doesn't load, check the Netlify function logs (`netlify dev` prints them to the terminal; on a deployed site, check **Functions** in the Netlify dashboard)
