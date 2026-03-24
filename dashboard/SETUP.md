# CareerPilot Dashboard v2.0 — Setup & Configuration Guide

**Last Updated:** 2026-03-24
**Location:** `F:\Projects\CareerPilot\dashboard\`
**Branch:** `feature/dashboard-v2`
**Jira Epic:** SCRUM-106

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Next.js runtime |
| npm | 9+ | Package manager |
| Git | 2.x | Version control |
| Anthropic API Key | `sk-ant-api03-...` | Job search via MCP |

---

## 1. Supabase Project Setup

### 1.1 Create Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Configure:
   - **Organization:** Your org (free tier)
   - **Project name:** `CareerPilot`
   - **Database password:** Generate a strong password — **save this somewhere**, you won't see it again
   - **Region:** Americas (East US / Ohio — `us-east-2`)
   - **Security:** Check both "Enable Data API" and "Enable automatic RLS"
4. Click **Create new project** and wait ~2 minutes for provisioning

### 1.2 Run Schema SQL

1. In the Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Open the file `dashboard/supabase/migrations/001_initial_schema.sql` from the project
3. Paste the entire contents into the SQL Editor
4. Click **Run**
5. You should see: `Success. No rows returned`

This creates:
- `applications` table (17 columns, RLS enabled)
- `activity_log` table (4 columns, RLS enabled)
- `search_cache` table (6 columns, RLS enabled)
- RLS policies on all tables (user-scoped via `auth.uid()`)
- Performance indexes on `user_id`, `status`, `date_found`, `created_at`, `searched_at`
- Auto-update trigger on `applications.updated_at`

### 1.3 Enable Realtime

1. Go to **SQL Editor**
2. Run:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE applications;
   ```
3. You should see: `Success. No rows returned`

This enables real-time subscriptions so the dashboard UI updates live when data changes.

### 1.4 Create Auth User

1. Go to **Authentication** (left sidebar) → **Users** tab
2. Click **Add User** → **Create New User**
3. Enter:
   - **Email:** `jlfowler1084@gmail.com`
   - **Password:** Your choice (minimum 6 characters)
   - **Check "Auto Confirm User"** if the option appears
4. Click **Create User**

This is the account you'll use to log into the dashboard. The session persists ~7 days.

### 1.5 Grab API Keys

1. Go to **Settings** → **API** (or **Data API** in left sidebar)
2. Copy these two values:
   - **Project URL** → `https://kfrffocrfnnuimwrngcs.supabase.co`
   - **Publishable Key (anon public)** → starts with `sb_publishable_...` or `eyJ...`

---

## 2. Local Development Setup

### 2.1 Clone and Branch

```powershell
cd F:\Projects\CareerPilot
git checkout feature/dashboard-v2
cd dashboard
npm install
```

### 2.2 Create Environment File

Create `dashboard/.env.local` (this file is gitignored — never committed):

```env
# Supabase (client-accessible)
NEXT_PUBLIC_SUPABASE_URL=https://kfrffocrfnnuimwrngcs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_wr3uv88z...  (full key from step 1.5)

# Anthropic (server-side ONLY — no NEXT_PUBLIC_ prefix!)
ANTHROPIC_API_KEY=sk-ant-api03-...  (your existing Anthropic API key)
```

**CRITICAL:** The `ANTHROPIC_API_KEY` must NOT have a `NEXT_PUBLIC_` prefix. Without the prefix, Next.js keeps it server-side only, so it never reaches the browser.

### 2.3 Start Development Server

```powershell
cd F:\Projects\CareerPilot\dashboard
npm run dev
```

Expected output:
```
▲ Next.js 16.2.1 (Turbopack)
- Local:        http://localhost:3000
- Environments: .env.local
✓ Ready in ~500ms
```

### 2.4 Test

1. Open `http://localhost:3000`
2. You should see the login page
3. Sign in with the email and password from step 1.4
4. You should land on the Overview dashboard
5. Navigate to Job Search and run a search to verify MCP connectivity

---

## 3. Vercel Deployment

### 3.1 Import to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Import Project** → select the CareerPilot GitHub repo
3. **IMPORTANT:** Set **Root Directory** to `dashboard/`
4. Framework should auto-detect as Next.js
5. Click **Deploy**

### 3.2 Configure Environment Variables

In the Vercel project dashboard → **Settings** → **Environment Variables**, add:

| Key | Value | Environment |
|-----|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kfrffocrfnnuimwrngcs.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` (full key) | All |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | All |

### 3.3 Test Deployment

After deploy completes:
1. Visit the Vercel URL
2. Log in with your Supabase auth credentials
3. **Test job search specifically** — MCP calls take 15-30 seconds; Vercel free tier has a 10-second timeout

**If searches timeout:** Either upgrade to Vercel Pro ($20/mo, 60s timeout) or implement the 30-minute cache-based rate limiting described in the design spec (Section 6.6).

### 3.4 Auto-Deploy

Vercel automatically deploys on every push to the connected branch. To set the production branch:
- **Settings** → **Git** → **Production Branch** → `feature/dashboard-v2` (change to `main` after merge)

---

## 4. Key Credentials Reference

| Credential | Format | Where It Lives |
|------------|--------|----------------|
| Supabase URL | `https://xxx.supabase.co` | `.env.local`, Vercel env vars |
| Supabase Anon Key | `sb_publishable_...` or `eyJ...` | `.env.local`, Vercel env vars |
| Supabase DB Password | (saved separately) | Supabase dashboard only |
| Supabase Auth Password | (your choice) | Used to log into dashboard |
| Anthropic API Key | `sk-ant-api03-...` | `.env.local`, Vercel env vars |

---

## 5. Database Schema Reference

### applications (17 columns)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | — | FK to `auth.users`, RLS scoping |
| `title` | TEXT | — | NOT NULL |
| `company` | TEXT | — | NOT NULL |
| `location` | TEXT | — | |
| `url` | TEXT | — | |
| `source` | TEXT | — | Indeed, Dice, Manual |
| `salary_range` | TEXT | — | Matches Python CLI column name |
| `status` | TEXT | `'found'` | 9 values (see below) |
| `job_type` | TEXT | — | Full-time, Contract, etc. |
| `posted_date` | TEXT | — | |
| `date_found` | TIMESTAMPTZ | `NOW()` | |
| `date_applied` | TIMESTAMPTZ | — | Set by hook when status → applied |
| `date_response` | TIMESTAMPTZ | — | Set by hook when status → response |
| `notes` | TEXT | `''` | |
| `profile_id` | TEXT | `''` | Which search profile found it |
| `updated_at` | TIMESTAMPTZ | `NOW()` | Auto-trigger on update |

### Status Values (all 9)

`found` · `interested` · `applied` · `phone_screen` · `interview` · `offer` · `rejected` · `withdrawn` · `ghosted`

- Jobs tracked from Search view default to `interested`
- Jobs added manually default to `found`

### activity_log (4 columns)

`id` (UUID) · `user_id` (UUID) · `action` (TEXT) · `created_at` (TIMESTAMPTZ)

### search_cache (6 columns)

`id` (UUID) · `user_id` (UUID) · `profile_id` (TEXT) · `results` (JSONB) · `result_count` (INTEGER) · `searched_at` (TIMESTAMPTZ)

---

## 6. Project Structure

```
F:\Projects\CareerPilot\
├── dashboard/                    ← Next.js app (Vercel root directory)
│   ├── src/
│   │   ├── app/                  ← Pages and API routes
│   │   │   ├── layout.tsx        ← Root layout (sidebar + header + auth)
│   │   │   ├── page.tsx          ← Overview (/)
│   │   │   ├── search/           ← Job Search (/search)
│   │   │   ├── applications/     ← Tracker (/applications)
│   │   │   ├── analytics/        ← Charts (/analytics)
│   │   │   ├── login/            ← Auth (/login)
│   │   │   └── api/              ← Server-side routes
│   │   │       ├── search-indeed/route.ts
│   │   │       └── search-dice/route.ts
│   │   ├── components/           ← UI components
│   │   ├── hooks/                ← use-applications, use-search, etc.
│   │   ├── lib/                  ← Supabase clients, parsers, utils
│   │   └── types/                ← TypeScript interfaces
│   ├── supabase/
│   │   └── migrations/
│   │       └── 001_initial_schema.sql
│   ├── .env.local                ← Local credentials (gitignored)
│   ├── .env.example              ← Template (committed)
│   └── middleware.ts             ← Auth session refresh
├── src/                          ← Python CLI (existing)
├── config/                       ← Python config (existing)
└── data/                         ← Python data (existing)
```

---

## 7. Troubleshooting

### "Invalid API key" on job search
- Verify `ANTHROPIC_API_KEY` in `.env.local` has no `NEXT_PUBLIC_` prefix
- Restart dev server after changing `.env.local`

### Login fails / "Invalid login credentials"
- Verify you created the auth user in Supabase (step 1.4)
- Check that "Auto Confirm User" was enabled
- Try resetting the password in Supabase Auth dashboard

### "Permission denied" / empty data after login
- RLS policies require `auth.uid()` to match `user_id` — make sure the hooks are passing `user_id` on inserts
- Verify RLS is enabled: run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';`

### Realtime not updating
- Verify the publication: run `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';`
- Should show `applications` in the list

### Vercel search timeout
- MCP calls take 15-30s; free tier caps at 10s
- Options: Vercel Pro ($20/mo), streaming responses, or cache-based rate limiting

### Schema needs to be recreated
1. In Supabase SQL Editor, run: `DROP TABLE IF EXISTS search_cache, activity_log, applications CASCADE;`
2. Drop the trigger function: `DROP FUNCTION IF EXISTS update_updated_at();`
3. Re-run `001_initial_schema.sql`
4. Re-enable Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE applications;`
5. Re-create your auth user if needed

---

## 8. Cost Summary

| Service | Free Tier | Paid (if needed) |
|---------|-----------|------------------|
| Next.js | Free (open source) | — |
| Shadcn/ui + Tailwind | Free (open source) | — |
| Supabase | 500MB DB, 1GB storage, 50K MAU | $25/mo (Pro) |
| Vercel | Unlimited deploys, 10s timeout | $20/mo (Pro, 60s timeout) |
| Anthropic API | Pay-per-use | ~$0.003 per search call |
| Recharts | Free (open source) | — |
| **Total** | **$0/mo** + API pennies | **$45/mo** if you scale |

---

## 9. Jira Stories

| Phase | Key | Description | Status |
|-------|-----|-------------|--------|
| Epic | SCRUM-106 | Dashboard Migration | In Progress |
| 1 | SCRUM-107 | Scaffold Next.js | Done |
| 2 | SCRUM-108 | Layout + Routing | Done |
| 3 | SCRUM-109 | Supabase Schema | Done |
| 4 | SCRUM-110 | Job Search API | Done |
| 5 | SCRUM-111 | Application Tracker | Done |
| 6 | SCRUM-112 | Analytics + Overview | Done |
| 7 | SCRUM-113 | Supabase Auth | Done |
| 8 | SCRUM-114 | Vercel Deploy | In Review |
| 9 | SCRUM-115 | Polish | Done |
| 10 | SCRUM-117 | Future Enhancements | To Do |

---

*This document should be stored at `F:\Projects\CareerPilot\dashboard\SETUP.md` and committed to the repo. It is safe to commit — no actual credentials are included, only formats and placeholders.*
