# CareerPilot v2.0 — Dashboard MVP Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Jira:** SCRUM-107 through SCRUM-115 (Phases 1–9), SCRUM-117 (Phase 10 planning)
**Location:** `F:\Projects\CareerPilot\dashboard\` (monorepo subdirectory)

---

## 1. Overview

Migrate CareerPilot from a Python CLI to a web dashboard using Next.js (App Router) + Supabase + Shadcn/ui + Tailwind CSS. The MVP ships 4 views — Overview, Job Search, Applications, Analytics — backed by Supabase for persistence and Supabase Auth for single-user authentication.

### Scope

- **In scope (MVP):** Overview dashboard, job search via MCP, application tracker, analytics charts, Supabase Auth, Vercel deployment.
- **Out of scope (Phase 10+):** Gmail/Calendar integration, interview analysis, resume tailoring, Python FastAPI backend bridge.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| MVP scope | 4 views (Option A) | Matches JSX prototype + Jira stories. Ship fast, iterate. |
| Backend for MVP | Supabase-only (Option C) | No Python needed for CRUD + MCP search. FastAPI deferred to Phase 10. |
| Project location | Monorepo subdirectory | Single context for Claude Code. Vercel root directory = `dashboard/`. |
| Authentication | Supabase Auth, auto-login (Option C) | Keeps user_id/RLS intact for Phase 10. Login once, session persists ~7 days. |
| Search architecture | Next.js API routes + Supabase cache | API key server-side. Cache enables cross-session dedup + analytics. |

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | TypeScript, `src/` directory |
| UI Components | Shadcn/ui | Button, Card, Badge, Input, Select, Table, Tabs, Dialog, DropdownMenu, Separator, Tooltip |
| Styling | Tailwind CSS | Default config + custom status colors |
| Database | Supabase (PostgreSQL) | Free tier: 500MB DB, 50K MAU |
| Auth | Supabase Auth | Email/password, single pre-created account |
| Charts | Recharts | Pie, Area, Bar, Line charts |
| Icons | Lucide React | Same icon set as JSX prototype |
| Dates | date-fns | Lightweight date formatting |
| Deployment | Vercel | Free tier, root directory = `dashboard/` |

### Additional Dependencies

```
@supabase/supabase-js
@supabase/ssr
recharts
lucide-react
date-fns
```

---

## 3. Supabase Schema

Schema is designed for column-level compatibility with the Python CLI's SQLite `applications` table, enabling a seamless Phase 10 bridge.

### 3.1 applications

```sql
CREATE TABLE applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  url TEXT,
  source TEXT,
  salary_range TEXT,                          -- matches Python column name (not "salary")
  status TEXT NOT NULL DEFAULT 'found',
  job_type TEXT,                              -- from JSX prototype
  posted_date TEXT,                           -- from JSX prototype
  date_found TIMESTAMPTZ DEFAULT NOW(),
  date_applied TIMESTAMPTZ,
  date_response TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  profile_id TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Statuses (all 9 from Python CLI):** found, interested, applied, phone_screen, interview, offer, rejected, withdrawn, ghosted.

**Entry-point logic (in use-applications hook, not schema):**
- "Track" from Job Search view → status = `interested`
- Manual add from Applications view → status = `found`

**Date tracking (in use-applications hook, not trigger):**
- Status changes to `applied` → set `date_applied = NOW()`
- Status changes to phone_screen/interview/offer/rejected → set `date_response = NOW()` (if not already set)

### 3.2 activity_log

```sql
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 search_cache

```sql
CREATE TABLE search_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  results JSONB NOT NULL,
  result_count INTEGER DEFAULT 0,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Zero-result writes:** Cache entries are written even when a profile returns 0 results. A dry market is useful data for analytics.

### 3.4 RLS & Indexes

```sql
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own applications" ON applications
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own activity" ON activity_log
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own cache" ON search_cache
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_apps_user ON applications(user_id);
CREATE INDEX idx_apps_status ON applications(status);
CREATE INDEX idx_apps_date ON applications(date_found DESC);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_cache_user ON search_cache(user_id, searched_at DESC);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applications_updated
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 3.5 Schema Compatibility Notes

| Python CLI (SQLite) | Supabase (PostgreSQL) | Notes |
|---|---|---|
| `id` INTEGER | `id` UUID | Phase 10 bridge maps via lookup, not direct ID match |
| N/A | `user_id` UUID | New — required for RLS |
| `salary_range` TEXT | `salary_range` TEXT | Intentionally same name |
| `status` TEXT (9 values) | `status` TEXT (same 9) | Identical status set |
| `date_found` TEXT (ISO) | `date_found` TIMESTAMPTZ | Bridge converts with `datetime.fromisoformat()` |
| N/A | `job_type`, `posted_date` | New — from search result metadata |
| N/A | `updated_at` TIMESTAMPTZ | New — auto-trigger |

---

## 4. Component Architecture

### 4.1 App Router Structure

```
dashboard/src/app/
  layout.tsx              ← Root: sidebar + header + Supabase auth provider
  page.tsx                ← Overview (/)
  search/page.tsx         ← Job Search (/search)
  applications/page.tsx   ← Application Tracker (/applications)
  analytics/page.tsx      ← Analytics (/analytics)
  login/page.tsx          ← One-time login (Supabase Auth)
  api/
    search-indeed/route.ts  ← POST: Anthropic + MCP → Indeed
    search-dice/route.ts    ← POST: Anthropic + MCP → Dice
```

### 4.2 Component Tree by View

**Overview (`/`)**
```
OverviewPage
  ├── KpiCards (4x: Total Tracked, Active Pipeline, Response Rate, Last Search)
  ├── PipelineChart (Recharts PieChart, inner donut)
  ├── WeeklyChart (Recharts AreaChart, 6-week window)
  └── ActivityFeed (last 8 activity_log entries)
```

**Job Search (`/search`)**
```
SearchPage
  ├── ProfileChips (8 toggleable search profiles)
  ├── SearchControls (Run / Stop / Progress)
  ├── SearchStatus (count + source breakdown)
  └── JobCard[] (title, company, salary, type, source badge, Track button, NEW badge)
```

**Applications (`/applications`)**
```
ApplicationsPage
  ├── TrackerControls (filter by status, sort, Add Manual button)
  ├── KanbanSummary (9 status cards with counts, clickable filter)
  ├── AddApplicationForm (collapsible manual entry)
  └── ApplicationRow[] (title, company, StatusBadge, status dropdown, edit notes, delete)
```

**Analytics (`/analytics`)**
```
AnalyticsPage
  ├── KpiCards (4x: Total, Callbacks, Offers, Rejections)
  ├── SourceChart (Recharts BarChart by source)
  ├── PipelineFunnel (horizontal bars per status)
  └── ApplicationTimeline (Recharts LineChart, last 14 days)
```

### 4.3 Shared Components

```
dashboard/src/components/
  layout/
    sidebar.tsx         ← Collapsible nav, 4 items, user avatar, "CP" logo
    header.tsx          ← View title, date, active/total count badges
  shared/
    kpi-card.tsx        ← Reusable (icon, label, value, sub, color)
    status-badge.tsx    ← Color-coded pill for all 9 statuses
    job-card.tsx        ← Job result card with optional "NEW" indicator
  ui/                   ← Shadcn/ui auto-generated
```

### 4.4 KanbanSummary Grid Layout

9 statuses requires a different grid than the prototype's 6. Use `grid-cols-3 lg:grid-cols-5` with natural wrapping (3×3 on mobile, 5+4 on desktop) rather than `lg:grid-cols-9` which would be too compressed.

---

## 5. Custom Hooks

### 5.1 use-applications

CRUD + real-time subscription on the `applications` table.

- `addApplication(app, entryPoint)` — sets status based on entry point (`interested` from search, `found` from manual)
- `updateApplication(id, updates)` — handles date_applied/date_response tracking in the hook (not database trigger)
- `deleteApplication(id)`
- Real-time subscription via Supabase channels (INSERT, UPDATE, DELETE)
- Auto-logs to activity_log on every mutation

### 5.2 use-activity-log

- `logActivity(action)` — writes entry with current timestamp
- `getRecentActivity(limit)` — reads last N entries
- Called automatically by use-applications on CRUD actions

### 5.3 use-search

Orchestrates the full search flow:

- Profile selection state (Set of profile IDs)
- Sequential MCP calls per profile (not parallel — avoids rate limits)
- Progress tracking (currentProfile, completed/total)
- Abort support (ref-based, checks between profiles)
- Dedup via `deduplicateJobs()` and `filterIrrelevant()`
- Cross-session dedup via `deduplicateAgainstCache()` (flags "NEW" vs "previously seen")
- Writes to `search_cache` after each profile completes (including zero-result runs)

### 5.4 use-stats

Derived computations from applications array:

- `by_status` — count per status (mirrors Python's `get_stats()`)
- `response_rate` — responded / applied × 100 (RESPONSE_STATUSES: phone_screen, interview, offer, rejected)
- `source_distribution` — count per source
- `weekly_activity` — applications added per week (6-week window)
- `timeline` — applications per day (last 14 days)

---

## 6. API Routes

### 6.1 POST /api/search-indeed

**Request:** `{ keyword: string, location: string }`
**Response:** `{ jobs: Job[], source: "Indeed", count: number, error?: string }`

Flow:
1. Validate keyword + location (400 if missing)
2. POST to Anthropic Messages API with MCP server `mcp.indeed.com`
3. Parse markdown response via Indeed parser (regex-based field extraction)
4. Return normalized Job[] (200 even on 0 results)

### 6.2 POST /api/search-dice

**Request:** `{ keyword: string, location: string, contractOnly?: boolean }`
**Response:** `{ jobs: Job[], source: "Dice", count: number, error?: string }`

Flow:
1. Validate keyword + location (400 if missing)
2. POST to Anthropic Messages API with MCP server `mcp.dice.com`
3. Parse JSON response via Dice parser (primary: JSON `{ data: [...] }`, fallback: line-by-line regex)
4. Return normalized Job[] (200 even on 0 results)

### 6.3 Common Patterns

**Anthropic API call:**
```
POST https://api.anthropic.com/v1/messages
Headers: x-api-key (from env ANTHROPIC_API_KEY), anthropic-version: 2023-06-01
Body: model: claude-sonnet-4-6, max_tokens: 4000, mcp_servers: [{ type: "url", url: "..." }]
```

**Error handling (per-profile, not all-or-nothing):**
- Anthropic API down → return 502 `{ error: "Search service unavailable" }`
- MCP timeout → return 200 `{ jobs: [], error: "MCP timeout", count: 0 }` (zero-result cache write still happens)
- Parse failure → log raw response, return partial results

**Environment:**
- `ANTHROPIC_API_KEY` — server-side only (NO `NEXT_PUBLIC_` prefix)
- `NEXT_PUBLIC_SUPABASE_URL` — client-accessible
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client-accessible

### 6.4 Parsers

Located at `dashboard/src/lib/parsers/`:

**indeed.ts** — Ported from JSX prototype's `parseIndeedResults()`. Splits on `**Job Title:**` markers, extracts via regex: Company, Location, Compensation, View Job URL, Posted on, Job Type.

**dice.ts** — Ported from JSX prototype's `parseDiceResults()`. Primary path: JSON `{ data: [...] }` extraction. Fallback: line-by-line regex. Fields: title, companyName, jobLocation.displayName, salary, detailsPageUrl, postedDate, employmentType, easyApply.

### 6.5 Search Utilities

Located at `dashboard/src/lib/search-utils.ts`:

**deduplicateJobs(jobs)** — Key: `lowercase(title + "|||" + company)`. Same logic as Python's `searcher.py` and JSX prototype.

**filterIrrelevant(jobs)** — Checks title against irrelevant keywords list. Full list from Python's `searcher.py`:
```
pest control, hvac, construction, mechanical engineer, civil engineer,
plumber, electrician, roofing, landscaping, janitorial, custodian
```

**deduplicateAgainstCache(newJobs, cachedJobs)** — Compares fresh results against previous `search_cache` entries. Returns `{ new: Job[], seen: Job[] }` so the UI can flag genuinely new postings with a "NEW" badge.

### 6.6 Rate Limiting (Phase 9 Polish)

Nice-to-have for SCRUM-115: If `search_cache` already has results for a given `profile_id` from the last 30 minutes, return cached results instead of hitting the Anthropic API. Protects API spend and speeds up repeated searches.

---

## 7. TypeScript Types

### 7.1 Core Types (`dashboard/src/types/index.ts`)

```typescript
// Job from search API route response
interface Job {
  title: string
  company: string
  location: string
  salary: string
  url: string
  posted: string
  type: string
  source: "Indeed" | "Dice"
  easyApply?: boolean
  profileId: string
  profileLabel: string
}

// Application row in Supabase (snake_case matches column names — no mapping layer)
interface Application {
  id: string
  user_id: string
  title: string
  company: string
  location: string | null
  url: string | null
  source: string | null
  salary_range: string | null
  status: ApplicationStatus
  job_type: string | null
  posted_date: string | null
  date_found: string
  date_applied: string | null
  date_response: string | null
  notes: string
  profile_id: string
  updated_at: string
}

type ApplicationStatus =
  | "found" | "interested" | "applied"
  | "phone_screen" | "interview" | "offer"
  | "rejected" | "withdrawn" | "ghosted"

interface ActivityEntry {
  id: string
  user_id: string
  action: string
  created_at: string
}

interface SearchCacheEntry {
  id: string
  user_id: string
  profile_id: string
  results: Job[]
  result_count: number
  searched_at: string
}

// Derived: tracks metadata for an entire search session
interface SearchRun {
  profileIds: string[]
  startedAt: string
  completedAt: string | null
  totalResults: number
  newResults: number       // not in previous cache
  aborted: boolean
}
```

### 7.2 Constants (`dashboard/src/lib/constants.ts`)

```typescript
const STATUSES = [
  { id: "found",        label: "Found",        color: "#6b7280" },
  { id: "interested",   label: "Interested",   color: "#06b6d4" },
  { id: "applied",      label: "Applied",      color: "#3b82f6" },
  { id: "phone_screen", label: "Phone Screen", color: "#8b5cf6" },
  { id: "interview",    label: "Interview",    color: "#f59e0b" },
  { id: "offer",        label: "Offer",        color: "#10b981" },
  { id: "rejected",     label: "Rejected",     color: "#ef4444" },
  { id: "withdrawn",    label: "Withdrawn",    color: "#9ca3af" },
  { id: "ghosted",      label: "Ghosted",      color: "#d1d5db" },
] as const

// Mirrors Python's tracker.py RESPONSE_STATUSES exactly
const RESPONSE_STATUSES: ApplicationStatus[] =
  ["phone_screen", "interview", "offer", "rejected"]

const SEARCH_PROFILES = [
  { id: "sysadmin_local",    label: "Sys Admin — Indy",                 keyword: "systems administrator",                location: "Indianapolis, IN", source: "both" },
  { id: "syseng_local",      label: "Systems Engineer — Indy",          keyword: "systems engineer Windows",             location: "Indianapolis, IN", source: "both" },
  { id: "devops_local",      label: "DevOps / Cloud — Indy",            keyword: "DevOps cloud engineer Azure",          location: "Indianapolis, IN", source: "both" },
  { id: "powershell_remote", label: "PowerShell / Automation — Remote",  keyword: "PowerShell automation engineer",       location: "remote",           source: "both" },
  { id: "infra_remote",      label: "Infrastructure — Remote",          keyword: "Windows server VMware infrastructure", location: "remote",           source: "dice" },
  { id: "msp_local",         label: "MSP / IT Services — Indy",         keyword: "managed services IT engineer",         location: "Indianapolis, IN", source: "indeed" },
  { id: "contract_infra",    label: "Contract — Infrastructure",        keyword: "Windows server VMware infrastructure", location: "Indianapolis, IN", source: "dice_contract" },
  { id: "ad_identity",       label: "AD / Identity — Remote",           keyword: "Active Directory engineer identity",   location: "remote",           source: "dice" },
] as const

const IRRELEVANT_KEYWORDS = [
  "pest control", "hvac", "construction", "mechanical engineer",
  "civil engineer", "plumber", "electrician", "roofing",
  "landscaping", "janitorial", "custodian",
] as const
```

---

## 8. File Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Overview
│   │   ├── search/page.tsx
│   │   ├── applications/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── login/page.tsx
│   │   └── api/
│   │       ├── search-indeed/route.ts
│   │       └── search-dice/route.ts
│   ├── components/
│   │   ├── ui/                         # Shadcn/ui (auto-generated)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   └── header.tsx
│   │   ├── shared/
│   │   │   ├── kpi-card.tsx
│   │   │   ├── status-badge.tsx
│   │   │   └── job-card.tsx
│   │   ├── dashboard/
│   │   │   ├── pipeline-chart.tsx
│   │   │   ├── weekly-chart.tsx
│   │   │   └── activity-feed.tsx
│   │   ├── search/
│   │   │   ├── profile-chips.tsx
│   │   │   └── search-controls.tsx
│   │   ├── applications/
│   │   │   ├── application-row.tsx
│   │   │   ├── kanban-summary.tsx
│   │   │   └── add-form.tsx
│   │   └── analytics/
│   │       ├── source-chart.tsx
│   │       ├── pipeline-funnel.tsx
│   │       └── timeline-chart.tsx
│   ├── hooks/
│   │   ├── use-applications.ts
│   │   ├── use-activity-log.ts
│   │   ├── use-search.ts
│   │   └── use-stats.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts               # createBrowserClient()
│   │   │   ├── server.ts               # createServerClient()
│   │   │   └── middleware.ts            # Session refresh (~15 lines)
│   │   ├── parsers/
│   │   │   ├── indeed.ts
│   │   │   └── dice.ts
│   │   ├── search-utils.ts             # dedup, filter, cache comparison
│   │   ├── search-profiles.ts          # SEARCH_PROFILES constant
│   │   └── constants.ts                # STATUSES, RESPONSE_STATUSES, IRRELEVANT_KEYWORDS
│   └── types/
│       └── index.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── middleware.ts                        # Next.js middleware (auth session refresh)
├── .env.local                          # ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
├── .env.example
├── .gitignore                          # node_modules/, .next/, .env.local, .vercel/
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── next.config.ts
```

---

## 9. Data Flow Diagrams

### Job Search Flow

```
ProfileChips → SearchControls (run) → use-search hook
  → POST /api/search-dice { keyword, location }
  → Anthropic API + MCP → parse results
  → return Job[] to browser + async write search_cache (even 0 results)
  → dedup within results + filter irrelevant
  → dedup against cache → flag "NEW" vs "seen"
  → render JobCard[] (with NEW badge on fresh listings)
  → user clicks "Track" → use-applications.add(status='interested')
  → Supabase insert + real-time update → activity_log entry
```

### Application Update Flow

```
ApplicationRow → status dropdown change → use-applications.update()
  → if status == 'applied' && !date_applied: set date_applied = NOW()
  → if status in RESPONSE_STATUSES && !date_response: set date_response = NOW()
  → Supabase update (updated_at auto-trigger)
  → real-time subscription fires → UI updates
  → activity_log entry auto-created
```

### Analytics Computation Flow

```
AnalyticsPage mounts → use-stats hook
  → reads applications[] from use-applications
  → computes: by_status, response_rate, source_distribution, weekly, timeline
  → feeds Recharts: SourceChart, PipelineFunnel, ApplicationTimeline
```

---

## 10. Deployment

**Platform:** Vercel (free tier)
**Root directory:** `dashboard/` (set in Vercel project settings)
**Build command:** `next build` (Vercel default)
**Environment variables:** Set in Vercel dashboard (ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)

### Vercel Free Tier Limits

- Unlimited deployments
- 10-second serverless function timeout (sufficient for MCP search calls)
- HTTPS + CDN included
- No Vercel password protection on free tier (Supabase Auth handles access control)

### .gitignore for dashboard/

```
node_modules/
.next/
.env.local
.vercel/
```

---

## 11. Jira Story Mapping

| Phase | Jira | What Gets Built |
|---|---|---|
| 1 | SCRUM-107 | Scaffold Next.js project, install Shadcn/ui, Tailwind config |
| 2 | SCRUM-108 | Sidebar + header layout, App Router routing |
| 3 | SCRUM-109 | Supabase project, run schema SQL, client setup, auth |
| 4 | SCRUM-110 | Job search API routes + use-search hook + parsers |
| 5 | SCRUM-111 | Application tracker CRUD + use-applications hook |
| 6 | SCRUM-112 | Analytics charts with Recharts |
| 7 | SCRUM-113 | Supabase Auth middleware (~15 lines boilerplate) |
| 8 | SCRUM-114 | Vercel deployment, env vars, root directory config |
| 9 | SCRUM-115 | Loading states, error boundaries, responsive polish, rate limiting |
| 10 | SCRUM-117 | Planning story: Gmail/Calendar/interview/FastAPI integration |

---

## 12. Open Items for Future Phases

- **"NEW" badge on JobCard** — visual indicator for jobs not in previous search_cache (SCRUM-110)
- **30-minute cache-based rate limiting** — return cached results if profile searched recently (SCRUM-115)
- **SearchRun metadata** — derived type for Analytics view to show search session summaries
- **KanbanSummary grid** — `grid-cols-3 lg:grid-cols-5` for 9 statuses (SCRUM-108)
- **Full IRRELEVANT_KEYWORDS list** — port all 11 from Python's `searcher.py`, not JSX prototype's subset of 7 (SCRUM-110)
