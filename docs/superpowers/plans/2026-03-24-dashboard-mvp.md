# CareerPilot v2.0 Dashboard MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web dashboard with 4 views (Overview, Search, Applications, Analytics) backed by Supabase, deployed to Vercel.

**Architecture:** Next.js 14 App Router in `dashboard/` monorepo subdirectory. Supabase for all persistence + auth. Next.js API routes proxy Anthropic + MCP for job search (keeping API key server-side). No Python backend in MVP.

**Tech Stack:** Next.js 14, TypeScript, Supabase, Shadcn/ui, Tailwind CSS, Recharts, Lucide React, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-24-dashboard-mvp-design.md`

---

## Task 1: Scaffold Next.js Project (SCRUM-107)

**Files:**
- Create: `dashboard/` (via create-next-app)
- Create: `dashboard/.gitignore`
- Create: `dashboard/.env.example`
- Create: `dashboard/.env.local`

- [ ] **Step 1: Create Next.js project**

```bash
cd F:/Projects/CareerPilot
npx create-next-app@latest dashboard --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

Accept defaults. This creates the full scaffold with App Router, TypeScript, Tailwind, and `src/` directory.

- [ ] **Step 2: Install Shadcn/ui**

```bash
cd F:/Projects/CareerPilot/dashboard
npx shadcn@latest init
```

When prompted: use default style, default color, CSS variables = yes.

- [ ] **Step 3: Add Shadcn components**

```bash
npx shadcn@latest add button card badge input select table tabs dialog dropdown-menu separator tooltip
```

- [ ] **Step 4: Install additional dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr recharts lucide-react date-fns
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
```

- [ ] **Step 5: Create .env files**

Create `dashboard/.env.example`:
```
# Supabase (client-accessible)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Anthropic (server-side only — NO NEXT_PUBLIC_ prefix)
ANTHROPIC_API_KEY=your-api-key-here
```

Create `dashboard/.env.local` with actual values (never committed).

- [ ] **Step 6: Update dashboard/.gitignore**

Ensure these entries exist (some come from create-next-app, add any missing):
```
node_modules/
.next/
.env.local
.vercel/
```

- [ ] **Step 7: Configure Vitest**

Create `dashboard/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Create `dashboard/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest'
```

Add to `dashboard/package.json` scripts:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 8: Verify scaffold works**

```bash
cd F:/Projects/CareerPilot/dashboard
npm run dev
```

Open `http://localhost:3000` — should show Next.js default page. Kill the server.

```bash
npm run test:run
```

Should pass with 0 tests (no errors).

- [ ] **Step 9: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/
git commit -m "feat(SCRUM-107): scaffold Next.js dashboard with Shadcn/ui, Tailwind, Vitest"
```

---

## Task 2: TypeScript Types & Constants

**Files:**
- Create: `dashboard/src/types/index.ts`
- Create: `dashboard/src/lib/constants.ts`
- Test: `dashboard/src/__tests__/lib/constants.test.ts`

- [ ] **Step 1: Write the types file**

Create `dashboard/src/types/index.ts`:
```typescript
export interface Job {
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

export interface Application {
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

export type ApplicationStatus =
  | "found"
  | "interested"
  | "applied"
  | "phone_screen"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "ghosted"

export interface ActivityEntry {
  id: string
  user_id: string
  action: string
  created_at: string
}

export interface SearchCacheEntry {
  id: string
  user_id: string
  profile_id: string
  results: Job[]
  result_count: number
  searched_at: string
}

export interface SearchRun {
  profileIds: string[]
  startedAt: string
  completedAt: string | null
  totalResults: number
  newResults: number
  aborted: boolean
}
```

- [ ] **Step 2: Write the constants file**

Create `dashboard/src/lib/constants.ts`:
```typescript
import type { ApplicationStatus } from "@/types"

export const STATUSES = [
  { id: "found" as const, label: "Found", color: "#6b7280" },
  { id: "interested" as const, label: "Interested", color: "#06b6d4" },
  { id: "applied" as const, label: "Applied", color: "#3b82f6" },
  { id: "phone_screen" as const, label: "Phone Screen", color: "#8b5cf6" },
  { id: "interview" as const, label: "Interview", color: "#f59e0b" },
  { id: "offer" as const, label: "Offer", color: "#10b981" },
  { id: "rejected" as const, label: "Rejected", color: "#ef4444" },
  { id: "withdrawn" as const, label: "Withdrawn", color: "#9ca3af" },
  { id: "ghosted" as const, label: "Ghosted", color: "#d1d5db" },
] as const

export const RESPONSE_STATUSES: ApplicationStatus[] = [
  "phone_screen",
  "interview",
  "offer",
  "rejected",
]

export const SEARCH_PROFILES = [
  { id: "sysadmin_local", label: "Sys Admin — Indy", keyword: "systems administrator", location: "Indianapolis, IN", source: "both" as const },
  { id: "syseng_local", label: "Systems Engineer — Indy", keyword: "systems engineer Windows", location: "Indianapolis, IN", source: "both" as const },
  { id: "devops_local", label: "DevOps / Cloud — Indy", keyword: "DevOps cloud engineer Azure", location: "Indianapolis, IN", source: "both" as const },
  { id: "powershell_remote", label: "PowerShell / Automation — Remote", keyword: "PowerShell automation engineer", location: "remote", source: "both" as const },
  { id: "infra_remote", label: "Infrastructure — Remote", keyword: "Windows server VMware infrastructure", location: "remote", source: "dice" as const },
  { id: "msp_local", label: "MSP / IT Services — Indy", keyword: "managed services IT engineer", location: "Indianapolis, IN", source: "indeed" as const },
  { id: "contract_infra", label: "Contract — Infrastructure", keyword: "Windows server VMware infrastructure", location: "Indianapolis, IN", source: "dice_contract" as const },
  { id: "ad_identity", label: "AD / Identity — Remote", keyword: "Active Directory engineer identity", location: "remote", source: "dice" as const },
] as const

export const IRRELEVANT_KEYWORDS = [
  "pest control",
  "hvac",
  "construction",
  "mechanical engineer",
  "civil engineer",
  "plumber",
  "electrician",
  "roofing",
  "landscaping",
  "janitorial",
  "custodian",
] as const
```

- [ ] **Step 3: Write constants tests**

Create `dashboard/src/__tests__/lib/constants.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { STATUSES, RESPONSE_STATUSES, SEARCH_PROFILES, IRRELEVANT_KEYWORDS } from "@/lib/constants"

describe("STATUSES", () => {
  it("has all 9 statuses from Python CLI", () => {
    const ids = STATUSES.map((s) => s.id)
    expect(ids).toEqual([
      "found", "interested", "applied", "phone_screen",
      "interview", "offer", "rejected", "withdrawn", "ghosted",
    ])
  })

  it("each status has id, label, and color", () => {
    for (const s of STATUSES) {
      expect(s.id).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe("RESPONSE_STATUSES", () => {
  it("mirrors Python tracker.py RESPONSE_STATUSES", () => {
    expect(RESPONSE_STATUSES).toEqual([
      "phone_screen", "interview", "offer", "rejected",
    ])
  })
})

describe("SEARCH_PROFILES", () => {
  it("has 8 profiles", () => {
    expect(SEARCH_PROFILES).toHaveLength(8)
  })

  it("each profile has required fields", () => {
    for (const p of SEARCH_PROFILES) {
      expect(p.id).toBeTruthy()
      expect(p.keyword).toBeTruthy()
      expect(p.location).toBeTruthy()
      expect(["both", "dice", "indeed", "dice_contract"]).toContain(p.source)
    }
  })
})

describe("IRRELEVANT_KEYWORDS", () => {
  it("has all 11 keywords from Python searcher.py", () => {
    expect(IRRELEVANT_KEYWORDS).toHaveLength(11)
    expect(IRRELEVANT_KEYWORDS).toContain("pest control")
    expect(IRRELEVANT_KEYWORDS).toContain("custodian")
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd F:/Projects/CareerPilot/dashboard
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/types/ dashboard/src/lib/constants.ts dashboard/src/__tests__/
git commit -m "feat(SCRUM-107): add TypeScript types and constants matching Python CLI"
```

---

## Task 3: Supabase Client & Schema Migration File

**Files:**
- Create: `dashboard/src/lib/supabase/client.ts`
- Create: `dashboard/src/lib/supabase/server.ts`
- Create: `dashboard/src/lib/supabase/middleware.ts`
- Create: `dashboard/supabase/migrations/001_initial_schema.sql`
- Create: `dashboard/middleware.ts`

- [ ] **Step 1: Create Supabase browser client**

Create `dashboard/src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create Supabase server client**

Create `dashboard/src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Create auth middleware helper**

Create `dashboard/src/lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/api")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 4: Create Next.js middleware**

Create `dashboard/middleware.ts`:
```typescript
import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

- [ ] **Step 5: Create schema migration SQL**

Create `dashboard/supabase/migrations/001_initial_schema.sql`:
```sql
-- CareerPilot v2.0 Dashboard Schema
-- Designed for column-level compatibility with Python CLI's SQLite applications table

-- Applications table
CREATE TABLE applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  url TEXT,
  source TEXT,
  salary_range TEXT,
  status TEXT NOT NULL DEFAULT 'found',
  job_type TEXT,
  posted_date TEXT,
  date_found TIMESTAMPTZ DEFAULT NOW(),
  date_applied TIMESTAMPTZ,
  date_response TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  profile_id TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search results cache
CREATE TABLE search_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  results JSONB NOT NULL,
  result_count INTEGER DEFAULT 0,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own applications" ON applications
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own activity" ON activity_log
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own cache" ON search_cache
  FOR ALL USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX idx_apps_user ON applications(user_id);
CREATE INDEX idx_apps_status ON applications(status);
CREATE INDEX idx_apps_date ON applications(date_found DESC);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_cache_user ON search_cache(user_id, searched_at DESC);

-- Auto-update timestamp trigger
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

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd F:/Projects/CareerPilot/dashboard
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/lib/supabase/ dashboard/supabase/ dashboard/middleware.ts
git commit -m "feat(SCRUM-109): add Supabase client, auth middleware, and schema migration"
```

---

## Task 4: Search Parsers & Utilities

**Files:**
- Create: `dashboard/src/lib/parsers/indeed.ts`
- Create: `dashboard/src/lib/parsers/dice.ts`
- Create: `dashboard/src/lib/search-utils.ts`
- Test: `dashboard/src/__tests__/lib/parsers/indeed.test.ts`
- Test: `dashboard/src/__tests__/lib/parsers/dice.test.ts`
- Test: `dashboard/src/__tests__/lib/search-utils.test.ts`

- [ ] **Step 1: Write Indeed parser tests**

Create `dashboard/src/__tests__/lib/parsers/indeed.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { parseIndeedResults } from "@/lib/parsers/indeed"

describe("parseIndeedResults", () => {
  it("parses markdown-formatted Indeed results", () => {
    const text = `**Job Title:** Systems Administrator
**Company:** Acme Corp
**Location:** Indianapolis, IN
**Compensation:** $80,000 - $100,000
**View Job URL:** https://indeed.com/job/123
**Posted on:** 2026-03-20
**Job Type:** Full-time

**Job Title:** DevOps Engineer
**Company:** TechCo
**Location:** Remote
**Compensation:** Not listed
**View Job URL:** https://indeed.com/job/456
**Posted on:** 2026-03-21
**Job Type:** Contract`

    const jobs = parseIndeedResults(text)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].title).toBe("Systems Administrator")
    expect(jobs[0].company).toBe("Acme Corp")
    expect(jobs[0].location).toBe("Indianapolis, IN")
    expect(jobs[0].salary).toBe("$80,000 - $100,000")
    expect(jobs[0].url).toBe("https://indeed.com/job/123")
    expect(jobs[0].source).toBe("Indeed")
    expect(jobs[1].title).toBe("DevOps Engineer")
    expect(jobs[1].salary).toBe("Not listed")
  })

  it("returns empty array for empty input", () => {
    expect(parseIndeedResults("")).toEqual([])
  })

  it("handles partial fields gracefully", () => {
    const text = `**Job Title:** Partial Job
**Company:** SomeCo`
    const jobs = parseIndeedResults(text)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].title).toBe("Partial Job")
    expect(jobs[0].location).toBe("")
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd F:/Projects/CareerPilot/dashboard
npx vitest run src/__tests__/lib/parsers/indeed.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Indeed parser**

Create `dashboard/src/lib/parsers/indeed.ts`:
```typescript
import type { Job } from "@/types"

export function parseIndeedResults(text: string): Omit<Job, "profileId" | "profileLabel">[] {
  const jobs: Omit<Job, "profileId" | "profileLabel">[] = []
  const blocks = text.split(/\*\*Job Title:\*\*/)

  for (const block of blocks) {
    if (!block.trim()) continue
    const title = block.split("\n")[0]?.trim()
    if (!title) continue

    const companyMatch = block.match(/\*\*Company:\*\*\s*(.+)/)
    const locationMatch = block.match(/\*\*Location:\*\*\s*(.+)/)
    const salaryMatch = block.match(/\*\*Compensation:\*\*\s*(.+)/)
    const urlMatch = block.match(/\*\*View Job URL:\*\*\s*(https?:\/\/[^\s]+)/)
    const postedMatch = block.match(/\*\*Posted on:\*\*\s*(.+)/)
    const typeMatch = block.match(/\*\*Job Type:\*\*\s*(.+)/)

    jobs.push({
      title,
      company: companyMatch?.[1]?.trim() || "Unknown",
      location: locationMatch?.[1]?.trim() || "",
      salary: salaryMatch?.[1]?.trim() || "Not listed",
      url: urlMatch?.[1]?.trim() || "",
      posted: postedMatch?.[1]?.trim() || "",
      type: typeMatch?.[1]?.trim() || "",
      source: "Indeed",
    })
  }

  return jobs
}
```

- [ ] **Step 4: Run Indeed parser tests — expect pass**

```bash
npx vitest run src/__tests__/lib/parsers/indeed.test.ts
```

Expected: All pass.

- [ ] **Step 5: Write Dice parser tests**

Create `dashboard/src/__tests__/lib/parsers/dice.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { parseDiceResults } from "@/lib/parsers/dice"

describe("parseDiceResults", () => {
  it("parses JSON data array format", () => {
    const text = JSON.stringify({
      data: [
        {
          title: "Systems Engineer",
          companyName: "BigCorp",
          jobLocation: { displayName: "Indianapolis, IN" },
          salary: "$90k-$110k",
          detailsPageUrl: "https://dice.com/job/789",
          postedDate: "2026-03-20T00:00:00Z",
          employmentType: "Full-time",
          easyApply: true,
        },
        {
          title: "Cloud Admin",
          companyName: "CloudCo",
          isRemote: true,
          detailsPageUrl: "https://dice.com/job/012",
          employmentType: "Contract",
        },
      ],
    })

    const jobs = parseDiceResults(text)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].title).toBe("Systems Engineer")
    expect(jobs[0].company).toBe("BigCorp")
    expect(jobs[0].location).toBe("Indianapolis, IN")
    expect(jobs[0].easyApply).toBe(true)
    expect(jobs[0].source).toBe("Dice")
    expect(jobs[1].location).toBe("Remote")
  })

  it("returns empty array for unparseable input", () => {
    expect(parseDiceResults("some random text with no json")).toEqual([])
  })
})
```

- [ ] **Step 6: Run Dice test — expect failure**

```bash
npx vitest run src/__tests__/lib/parsers/dice.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implement Dice parser**

Create `dashboard/src/lib/parsers/dice.ts`:
```typescript
import type { Job } from "@/types"

export function parseDiceResults(text: string): Omit<Job, "profileId" | "profileLabel">[] {
  const jobs: Omit<Job, "profileId" | "profileLabel">[] = []

  try {
    // Primary: parse JSON { data: [...] }
    const jsonMatch = text.match(/\{[\s\S]*"data"\s*:\s*\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0] + (jsonMatch[0].endsWith("}") ? "" : "}"))
      if (parsed.data && Array.isArray(parsed.data)) {
        for (const job of parsed.data) {
          jobs.push({
            title: job.title || "",
            company: job.companyName || "Unknown",
            location:
              job.jobLocation?.displayName ||
              (job.isRemote ? "Remote" : ""),
            salary: job.salary || "Not listed",
            url: job.detailsPageUrl || "",
            posted: job.postedDate
              ? new Date(job.postedDate).toLocaleDateString()
              : "",
            type: job.employmentType || "",
            source: "Dice",
            easyApply: job.easyApply || false,
          })
        }
        return jobs
      }
    }
  } catch {
    // Fall through to line-by-line fallback
  }

  // Fallback: line-by-line regex extraction
  try {
    const lines = text.split("\n")
    let current: Record<string, string> = {}
    for (const line of lines) {
      const titleMatch = line.match(/"title"\s*:\s*"([^"]+)"/)
      if (titleMatch) current.title = titleMatch[1]
      const companyMatch = line.match(/"companyName"\s*:\s*"([^"]+)"/)
      if (companyMatch) current.company = companyMatch[1]
      const urlMatch = line.match(/"detailsPageUrl"\s*:\s*"([^"]+)"/)
      if (urlMatch) {
        current.url = urlMatch[1]
        if (current.title) {
          jobs.push({
            title: current.title,
            company: current.company || "Unknown",
            location: "",
            salary: "Not listed",
            url: current.url,
            posted: "",
            type: "",
            source: "Dice",
          })
        }
        current = {}
      }
    }
  } catch {
    // Return whatever we have
  }

  return jobs
}
```

- [ ] **Step 8: Run Dice parser tests — expect pass**

```bash
npx vitest run src/__tests__/lib/parsers/dice.test.ts
```

Expected: All pass.

- [ ] **Step 9: Write search-utils tests**

Create `dashboard/src/__tests__/lib/search-utils.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { deduplicateJobs, filterIrrelevant, deduplicateAgainstCache } from "@/lib/search-utils"
import type { Job } from "@/types"

const makeJob = (title: string, company: string, source: "Indeed" | "Dice" = "Dice"): Job => ({
  title, company, location: "", salary: "", url: "", posted: "", type: "",
  source, profileId: "test", profileLabel: "Test",
})

describe("deduplicateJobs", () => {
  it("removes duplicates by title+company (case insensitive)", () => {
    const jobs = [
      makeJob("Systems Admin", "Acme"),
      makeJob("systems admin", "ACME"),
      makeJob("DevOps Engineer", "Acme"),
    ]
    expect(deduplicateJobs(jobs)).toHaveLength(2)
  })

  it("keeps first occurrence", () => {
    const jobs = [
      makeJob("Admin", "Corp", "Indeed"),
      makeJob("Admin", "Corp", "Dice"),
    ]
    const result = deduplicateJobs(jobs)
    expect(result[0].source).toBe("Indeed")
  })
})

describe("filterIrrelevant", () => {
  it("removes pest control, hvac, etc.", () => {
    const jobs = [
      makeJob("Systems Administrator", "Good Co"),
      makeJob("Pest Control Technician", "Bug Co"),
      makeJob("HVAC Systems Engineer", "Cool Co"),
      makeJob("DevOps Engineer", "Tech Co"),
    ]
    const filtered = filterIrrelevant(jobs)
    expect(filtered).toHaveLength(2)
    expect(filtered.map((j) => j.title)).toEqual([
      "Systems Administrator",
      "DevOps Engineer",
    ])
  })
})

describe("deduplicateAgainstCache", () => {
  it("splits jobs into new and seen", () => {
    const newJobs = [
      makeJob("Admin", "Acme"),
      makeJob("Engineer", "TechCo"),
      makeJob("DevOps", "CloudCo"),
    ]
    const cached = [makeJob("Admin", "Acme"), makeJob("DevOps", "CloudCo")]
    const result = deduplicateAgainstCache(newJobs, cached)
    expect(result.new).toHaveLength(1)
    expect(result.new[0].title).toBe("Engineer")
    expect(result.seen).toHaveLength(2)
  })
})
```

- [ ] **Step 10: Run search-utils tests — expect failure**

```bash
npx vitest run src/__tests__/lib/search-utils.test.ts
```

Expected: FAIL.

- [ ] **Step 11: Implement search-utils**

Create `dashboard/src/lib/search-utils.ts`:
```typescript
import type { Job } from "@/types"
import { IRRELEVANT_KEYWORDS } from "@/lib/constants"

function jobKey(job: Pick<Job, "title" | "company">): string {
  return `${job.title}|||${job.company}`.toLowerCase()
}

export function deduplicateJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>()
  return jobs.filter((job) => {
    const key = jobKey(job)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function filterIrrelevant(jobs: Job[]): Job[] {
  return jobs.filter((job) => {
    const titleLower = job.title.toLowerCase()
    return !IRRELEVANT_KEYWORDS.some((kw) => titleLower.includes(kw))
  })
}

export function deduplicateAgainstCache(
  newJobs: Job[],
  cachedJobs: Pick<Job, "title" | "company">[]
): { new: Job[]; seen: Job[] } {
  const cachedKeys = new Set(cachedJobs.map(jobKey))
  const result: { new: Job[]; seen: Job[] } = { new: [], seen: [] }

  for (const job of newJobs) {
    if (cachedKeys.has(jobKey(job))) {
      result.seen.push(job)
    } else {
      result.new.push(job)
    }
  }

  return result
}
```

- [ ] **Step 12: Run all search-utils tests — expect pass**

```bash
npx vitest run src/__tests__/lib/search-utils.test.ts
```

Expected: All pass.

- [ ] **Step 13: Run full test suite**

```bash
cd F:/Projects/CareerPilot/dashboard
npm run test:run
```

Expected: All tests pass (constants + parsers + search-utils).

- [ ] **Step 14: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/lib/parsers/ dashboard/src/lib/search-utils.ts dashboard/src/__tests__/
git commit -m "feat(SCRUM-110): add Indeed/Dice parsers and search utilities with tests"
```

---

## Task 5: Layout Components — Sidebar & Header (SCRUM-108)

**Files:**
- Create: `dashboard/src/components/layout/sidebar.tsx`
- Create: `dashboard/src/components/layout/header.tsx`
- Modify: `dashboard/src/app/layout.tsx`
- Modify: `dashboard/src/app/page.tsx`

- [ ] **Step 1: Create Sidebar component**

Create `dashboard/src/components/layout/sidebar.tsx`:
```typescript
"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Search, Briefcase, BarChart3, ChevronRight } from "lucide-react"

const NAV_ITEMS = [
  { id: "overview", href: "/", label: "Overview", icon: LayoutDashboard },
  { id: "search", href: "/search", label: "Job Search", icon: Search },
  { id: "applications", href: "/applications", label: "Applications", icon: Briefcase },
  { id: "analytics", href: "/analytics", label: "Analytics", icon: BarChart3 },
]

export function Sidebar() {
  const [open, setOpen] = useState(true)
  const pathname = usePathname()

  return (
    <aside
      className={`${open ? "w-56" : "w-16"} flex-shrink-0 bg-zinc-900 text-white transition-all duration-300 flex flex-col`}
    >
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-sm text-zinc-900 flex-shrink-0">
            CP
          </div>
          {open && (
            <div>
              <div className="font-bold text-sm leading-tight">Career Pilot</div>
              <div className="text-[10px] text-zinc-500 font-mono">v2.0</div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${
                active
                  ? "bg-zinc-800 text-amber-400 font-bold border-r-2 border-amber-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {open && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <button
        onClick={() => setOpen(!open)}
        className="p-3 border-t border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ChevronRight
          size={16}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 flex-shrink-0">
            JF
          </div>
          {open && (
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">
                Joseph Fowler
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                Sheridan, IN
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create Header component**

Create `dashboard/src/components/layout/header.tsx`:
```typescript
"use client"

import { usePathname } from "next/navigation"
import { format } from "date-fns"

const VIEW_TITLES: Record<string, string> = {
  "/": "Overview",
  "/search": "Job Search",
  "/applications": "Applications",
  "/analytics": "Analytics",
}

interface HeaderProps {
  activeCount: number
  totalCount: number
}

export function Header({ activeCount, totalCount }: HeaderProps) {
  const pathname = usePathname()
  const title = VIEW_TITLES[pathname] || "Dashboard"

  return (
    <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">{title}</h1>
        <p className="text-xs text-zinc-400 font-mono mt-0.5">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          {activeCount} active
        </span>
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
          {totalCount} total
        </span>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Update root layout**

Replace `dashboard/src/app/layout.tsx` with:
```typescript
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/layout/sidebar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Career Pilot",
  description: "Job search dashboard",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-zinc-50 flex">
          <Sidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Create placeholder pages**

Update `dashboard/src/app/page.tsx`:
```typescript
export default function OverviewPage() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-bold">Overview</h2>
      <p className="text-sm text-zinc-500 mt-2">Dashboard coming soon.</p>
    </div>
  )
}
```

Create `dashboard/src/app/search/page.tsx`:
```typescript
export default function SearchPage() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-bold">Job Search</h2>
      <p className="text-sm text-zinc-500 mt-2">Search coming soon.</p>
    </div>
  )
}
```

Create `dashboard/src/app/applications/page.tsx`:
```typescript
export default function ApplicationsPage() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-bold">Applications</h2>
      <p className="text-sm text-zinc-500 mt-2">Tracker coming soon.</p>
    </div>
  )
}
```

Create `dashboard/src/app/analytics/page.tsx`:
```typescript
export default function AnalyticsPage() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-bold">Analytics</h2>
      <p className="text-sm text-zinc-500 mt-2">Charts coming soon.</p>
    </div>
  )
}
```

- [ ] **Step 5: Verify navigation works**

```bash
cd F:/Projects/CareerPilot/dashboard
npm run dev
```

Open `http://localhost:3000`. Verify:
- Sidebar renders with 4 nav items
- Clicking each nav item routes to the correct page
- Active nav item is highlighted amber
- Sidebar collapse/expand works

- [ ] **Step 6: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/components/layout/ dashboard/src/app/
git commit -m "feat(SCRUM-108): add sidebar, header, and 4-page routing layout"
```

---

## Task 6: Shared UI Components

**Files:**
- Create: `dashboard/src/components/shared/kpi-card.tsx`
- Create: `dashboard/src/components/shared/status-badge.tsx`
- Create: `dashboard/src/components/shared/job-card.tsx`
- Test: `dashboard/src/__tests__/components/shared/status-badge.test.tsx`

- [ ] **Step 1: Create KpiCard**

Create `dashboard/src/components/shared/kpi-card.tsx`:
```typescript
import type { LucideIcon } from "lucide-react"

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: string
  color: string
}

export function KpiCard({ icon: Icon, label, value, sub, color }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold text-zinc-900 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-400 mt-1">{sub}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Create StatusBadge**

Create `dashboard/src/components/shared/status-badge.tsx`:
```typescript
import { STATUSES } from "@/lib/constants"
import type { ApplicationStatus } from "@/types"

interface StatusBadgeProps {
  status: ApplicationStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUSES.find((x) => x.id === status) || STATUSES[0]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: `${s.color}15`, color: s.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: s.color }}
      />
      {s.label}
    </span>
  )
}
```

- [ ] **Step 3: Write StatusBadge test**

Create `dashboard/src/__tests__/components/shared/status-badge.test.tsx`:
```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatusBadge } from "@/components/shared/status-badge"

describe("StatusBadge", () => {
  it("renders the correct label for each status", () => {
    const { rerender } = render(<StatusBadge status="applied" />)
    expect(screen.getByText("Applied")).toBeTruthy()

    rerender(<StatusBadge status="ghosted" />)
    expect(screen.getByText("Ghosted")).toBeTruthy()

    rerender(<StatusBadge status="interested" />)
    expect(screen.getByText("Interested")).toBeTruthy()
  })
})
```

- [ ] **Step 4: Run StatusBadge test**

```bash
npx vitest run src/__tests__/components/shared/status-badge.test.tsx
```

Expected: Pass.

- [ ] **Step 5: Create JobCard**

Create `dashboard/src/components/shared/job-card.tsx`:
```typescript
import { ExternalLink, Plus } from "lucide-react"
import type { Job } from "@/types"

interface JobCardProps {
  job: Job
  onTrack: (job: Job) => void
  tracked: boolean
  isNew?: boolean
}

export function JobCard({ job, onTrack, tracked, isNew }: JobCardProps) {
  const sourceColor = job.source === "Indeed" ? "#2557a7" : "#0c7ff2"

  return (
    <div
      className="bg-white rounded-xl border border-zinc-200 p-4 hover:shadow-md transition-all hover:-translate-y-px group"
      style={{ borderLeft: `4px solid ${sourceColor}` }}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="font-bold text-sm text-zinc-900 leading-tight group-hover:text-blue-700 transition-colors cursor-pointer"
              onClick={() => job.url && window.open(job.url, "_blank")}
            >
              {job.title}
              <ExternalLink
                size={12}
                className="inline ml-1.5 opacity-0 group-hover:opacity-60 transition-opacity"
              />
            </span>
            {isNew && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">
                NEW
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mb-2">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {job.salary && job.salary !== "Not listed" && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {job.salary}
              </span>
            )}
            {job.type && job.type !== "N/A" && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                {job.type}
              </span>
            )}
            {job.easyApply && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green-50 text-green-700">
                Easy Apply
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span
            className="text-[10px] font-bold font-mono px-2 py-0.5 rounded text-white"
            style={{ background: sourceColor }}
          >
            {job.source}
          </span>
          {job.posted && (
            <span className="text-[10px] text-zinc-400 font-mono">{job.posted}</span>
          )}
          {!tracked ? (
            <button
              onClick={() => onTrack(job)}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1"
            >
              <Plus size={10} /> Track
            </button>
          ) : (
            <span className="text-[10px] font-mono text-zinc-400">
              Tracked
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run full test suite**

```bash
cd F:/Projects/CareerPilot/dashboard
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/components/shared/ dashboard/src/__tests__/components/
git commit -m "feat(SCRUM-108): add KpiCard, StatusBadge, and JobCard shared components"
```

---

## Task 7: use-activity-log Hook

**Files:**
- Create: `dashboard/src/hooks/use-activity-log.ts`
- Test: `dashboard/src/__tests__/hooks/use-activity-log.test.ts`

- [ ] **Step 1: Write test**

Create `dashboard/src/__tests__/hooks/use-activity-log.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Supabase client
const mockFrom = vi.fn()
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockGetUser = vi.fn()

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } })
  mockFrom.mockReturnValue({
    insert: mockInsert.mockReturnValue({ error: null }),
    select: mockSelect.mockReturnValue({
      order: mockOrder.mockReturnValue({
        limit: mockLimit.mockResolvedValue({ data: [], error: null }),
      }),
    }),
  })
})

describe("use-activity-log", () => {
  it("module imports without errors", async () => {
    const mod = await import("@/hooks/use-activity-log")
    expect(mod.logActivity).toBeDefined()
    expect(mod.fetchRecentActivity).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx vitest run src/__tests__/hooks/use-activity-log.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement use-activity-log**

Create `dashboard/src/hooks/use-activity-log.ts`:
```typescript
import { createClient } from "@/lib/supabase/client"
import type { ActivityEntry } from "@/types"

const supabase = createClient()

export async function logActivity(action: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action,
  })
}

export async function fetchRecentActivity(
  limit: number = 8
): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Failed to fetch activity:", error)
    return []
  }

  return data || []
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run src/__tests__/hooks/use-activity-log.test.ts
```

Expected: Pass.

- [ ] **Step 5: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/hooks/use-activity-log.ts dashboard/src/__tests__/hooks/
git commit -m "feat(SCRUM-111): add use-activity-log hook for activity feed"
```

---

## Task 8: use-applications Hook (SCRUM-111)

**Files:**
- Create: `dashboard/src/hooks/use-applications.ts`
- Test: `dashboard/src/__tests__/hooks/use-applications.test.ts`

- [ ] **Step 1: Write tests for the core logic**

Create `dashboard/src/__tests__/hooks/use-applications.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { RESPONSE_STATUSES } from "@/lib/constants"
import type { ApplicationStatus } from "@/types"

// Test the date-tracking logic that will live in the hook
function computeDateUpdates(
  newStatus: ApplicationStatus,
  currentDateApplied: string | null,
  currentDateResponse: string | null
): { date_applied?: string; date_response?: string } {
  const updates: { date_applied?: string; date_response?: string } = {}
  if (newStatus === "applied" && !currentDateApplied) {
    updates.date_applied = new Date().toISOString()
  }
  if (
    RESPONSE_STATUSES.includes(newStatus) &&
    !currentDateResponse
  ) {
    updates.date_response = new Date().toISOString()
  }
  return updates
}

describe("computeDateUpdates", () => {
  it("sets date_applied when status changes to applied", () => {
    const updates = computeDateUpdates("applied", null, null)
    expect(updates.date_applied).toBeTruthy()
    expect(updates.date_response).toBeUndefined()
  })

  it("does not overwrite existing date_applied", () => {
    const updates = computeDateUpdates("applied", "2026-01-01", null)
    expect(updates.date_applied).toBeUndefined()
  })

  it("sets date_response for phone_screen", () => {
    const updates = computeDateUpdates("phone_screen", null, null)
    expect(updates.date_response).toBeTruthy()
  })

  it("sets date_response for rejected", () => {
    const updates = computeDateUpdates("rejected", null, null)
    expect(updates.date_response).toBeTruthy()
  })

  it("does not set dates for found/interested/withdrawn/ghosted", () => {
    for (const status of ["found", "interested", "withdrawn", "ghosted"] as ApplicationStatus[]) {
      const updates = computeDateUpdates(status, null, null)
      expect(updates.date_applied).toBeUndefined()
      expect(updates.date_response).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: Run test — expect pass** (pure function, no imports needed beyond constants)

```bash
npx vitest run src/__tests__/hooks/use-applications.test.ts
```

Expected: Pass (the function is defined inline in the test; this validates the logic before wiring it into the hook).

- [ ] **Step 3: Implement use-applications hook**

Create `dashboard/src/hooks/use-applications.ts`:
```typescript
"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { RESPONSE_STATUSES } from "@/lib/constants"
import { logActivity } from "@/hooks/use-activity-log"
import type { Application, ApplicationStatus, Job } from "@/types"

const supabase = createClient()

function computeDateUpdates(
  newStatus: ApplicationStatus,
  currentDateApplied: string | null,
  currentDateResponse: string | null
): Record<string, string> {
  const updates: Record<string, string> = {}
  if (newStatus === "applied" && !currentDateApplied) {
    updates.date_applied = new Date().toISOString()
  }
  if (RESPONSE_STATUSES.includes(newStatus) && !currentDateResponse) {
    updates.date_response = new Date().toISOString()
  }
  return updates
}

export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchApps = async () => {
      const { data } = await supabase
        .from("applications")
        .select("*")
        .order("date_found", { ascending: false })

      setApplications(data || [])
      setLoading(false)
    }
    fetchApps()

    // Real-time subscription
    const channel = supabase
      .channel("applications-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setApplications((prev) => [payload.new as Application, ...prev])
          } else if (payload.eventType === "UPDATE") {
            setApplications((prev) =>
              prev.map((a) =>
                a.id === (payload.new as Application).id
                  ? (payload.new as Application)
                  : a
              )
            )
          } else if (payload.eventType === "DELETE") {
            setApplications((prev) =>
              prev.filter((a) => a.id !== (payload.old as Application).id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const addApplication = useCallback(
    async (
      job: Partial<Application> | Job,
      entryPoint: "search" | "manual" = "manual"
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const status = entryPoint === "search" ? "interested" : "found"

      const { data, error } = await supabase
        .from("applications")
        .insert({
          user_id: user.id,
          title: "title" in job ? job.title : "",
          company: "company" in job ? job.company : "",
          location: "location" in job ? job.location : null,
          url: "url" in job ? job.url : null,
          source: "source" in job ? job.source : null,
          salary_range:
            "salary_range" in job
              ? job.salary_range
              : "salary" in job
                ? (job as Job).salary
                : null,
          status,
          job_type: "type" in job ? (job as Job).type : ("job_type" in job ? job.job_type : null),
          posted_date: "posted" in job ? (job as Job).posted : ("posted_date" in job ? job.posted_date : null),
          profile_id:
            "profileId" in job
              ? (job as Job).profileId
              : "profile_id" in job
                ? job.profile_id
                : "",
          notes: "",
        })
        .select()
        .single()

      if (!error && data) {
        await logActivity(`Tracked: ${data.title} at ${data.company}`)
      }

      return { data, error }
    },
    []
  )

  const updateApplication = useCallback(
    async (id: string, updates: Partial<Application>) => {
      // Compute automatic date fields
      if (updates.status) {
        const current = applications.find((a) => a.id === id)
        if (current) {
          const dateUpdates = computeDateUpdates(
            updates.status,
            current.date_applied,
            current.date_response
          )
          Object.assign(updates, dateUpdates)
        }
      }

      const { data, error } = await supabase
        .from("applications")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (!error && data) {
        const statusLabel = updates.status
          ? ` → ${updates.status}`
          : ""
        await logActivity(`Updated: ${data.title}${statusLabel}`)
      }

      return { data, error }
    },
    [applications]
  )

  const deleteApplication = useCallback(async (id: string) => {
    const app = applications.find((a) => a.id === id)
    await supabase.from("applications").delete().eq("id", id)
    if (app) {
      await logActivity(`Removed: ${app.title} at ${app.company}`)
    }
  }, [applications])

  return { applications, loading, addApplication, updateApplication, deleteApplication }
}
```

- [ ] **Step 4: Run full test suite**

```bash
cd F:/Projects/CareerPilot/dashboard
npm run test:run
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/hooks/use-applications.ts dashboard/src/__tests__/hooks/use-applications.test.ts
git commit -m "feat(SCRUM-111): add use-applications hook with CRUD, real-time, and date tracking"
```

---

## Task 9: use-stats Hook (SCRUM-112)

**Files:**
- Create: `dashboard/src/hooks/use-stats.ts`
- Test: `dashboard/src/__tests__/hooks/use-stats.test.ts`

- [ ] **Step 1: Write tests**

Create `dashboard/src/__tests__/hooks/use-stats.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { computeStats } from "@/hooks/use-stats"
import type { Application } from "@/types"

const makeApp = (status: string, source: string = "Dice", dateApplied?: string, dateResponse?: string): Application => ({
  id: Math.random().toString(),
  user_id: "u1",
  title: "Test",
  company: "Co",
  location: null,
  url: null,
  source,
  salary_range: null,
  status: status as Application["status"],
  job_type: null,
  posted_date: null,
  date_found: "2026-03-01T00:00:00Z",
  date_applied: dateApplied || null,
  date_response: dateResponse || null,
  notes: "",
  profile_id: "",
  updated_at: "2026-03-01T00:00:00Z",
})

describe("computeStats", () => {
  it("computes by_status correctly", () => {
    const apps = [
      makeApp("applied"),
      makeApp("applied"),
      makeApp("interview"),
      makeApp("rejected"),
    ]
    const stats = computeStats(apps)
    expect(stats.by_status.applied).toBe(2)
    expect(stats.by_status.interview).toBe(1)
    expect(stats.by_status.rejected).toBe(1)
    expect(stats.by_status.found).toBe(0)
  })

  it("computes response_rate matching Python logic", () => {
    const apps = [
      makeApp("applied", "Dice", "2026-03-01"),
      makeApp("phone_screen", "Dice", "2026-03-01", "2026-03-05"),
      makeApp("rejected", "Indeed", "2026-03-01", "2026-03-10"),
      makeApp("found"),
    ]
    const stats = computeStats(apps)
    // 3 applied (have date_applied), 2 responded (have date_response)
    expect(stats.response_rate).toBeCloseTo(66.67, 0)
  })

  it("computes source_distribution", () => {
    const apps = [
      makeApp("applied", "Indeed"),
      makeApp("applied", "Dice"),
      makeApp("applied", "Dice"),
    ]
    const stats = computeStats(apps)
    expect(stats.source_distribution).toEqual([
      { name: "Indeed", value: 1 },
      { name: "Dice", value: 2 },
    ])
  })

  it("returns zeros for empty array", () => {
    const stats = computeStats([])
    expect(stats.total).toBe(0)
    expect(stats.response_rate).toBe(0)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx vitest run src/__tests__/hooks/use-stats.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement use-stats**

Create `dashboard/src/hooks/use-stats.ts`:
```typescript
import { useMemo } from "react"
import { STATUSES, RESPONSE_STATUSES } from "@/lib/constants"
import type { Application, ApplicationStatus } from "@/types"

export interface Stats {
  total: number
  by_status: Record<ApplicationStatus, number>
  applied_count: number
  responded_count: number
  response_rate: number
  source_distribution: { name: string; value: number }[]
}

export function computeStats(applications: Application[]): Stats {
  const total = applications.length

  const by_status = {} as Record<ApplicationStatus, number>
  for (const s of STATUSES) {
    by_status[s.id] = 0
  }
  for (const app of applications) {
    by_status[app.status] = (by_status[app.status] || 0) + 1
  }

  const applied_count = applications.filter((a) => a.date_applied).length
  const responded_count = applications.filter(
    (a) => a.date_applied && a.date_response
  ).length
  const response_rate =
    applied_count > 0 ? (responded_count / applied_count) * 100 : 0

  const sourceCounts: Record<string, number> = {}
  for (const app of applications) {
    const src = app.source || "Unknown"
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
  }
  const source_distribution = Object.entries(sourceCounts).map(
    ([name, value]) => ({ name, value })
  )

  return {
    total,
    by_status,
    applied_count,
    responded_count,
    response_rate,
    source_distribution,
  }
}

export function computeWeeklyActivity(
  applications: Application[],
  weeks: number = 6
): { week: string; count: number }[] {
  const result: { week: string; count: number }[] = []
  const now = new Date()

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)
    const weekLabel = `W${Math.ceil(weekStart.getDate() / 7)}`

    const count = applications.filter((a) => {
      const d = new Date(a.date_found)
      return d >= weekStart && d < weekEnd
    }).length

    result.push({ week: weekLabel, count })
  }

  return result
}

export function computeTimeline(
  applications: Application[],
  days: number = 14
): { date: string; count: number }[] {
  const counts: Record<string, number> = {}

  for (const app of applications) {
    const d = new Date(app.date_found).toLocaleDateString()
    counts[d] = (counts[d] || 0) + 1
  }

  return Object.entries(counts)
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .slice(-days)
    .map(([date, count]) => ({ date, count }))
}

export function useStats(applications: Application[]): Stats & {
  weekly: { week: string; count: number }[]
  timeline: { date: string; count: number }[]
} {
  return useMemo(() => ({
    ...computeStats(applications),
    weekly: computeWeeklyActivity(applications),
    timeline: computeTimeline(applications),
  }), [applications])
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run src/__tests__/hooks/use-stats.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/hooks/use-stats.ts dashboard/src/__tests__/hooks/use-stats.test.ts
git commit -m "feat(SCRUM-112): add use-stats hook mirroring Python's get_stats() logic"
```

---

## Task 10: API Routes — Search Indeed & Dice (SCRUM-110)

**Files:**
- Create: `dashboard/src/app/api/search-indeed/route.ts`
- Create: `dashboard/src/app/api/search-dice/route.ts`

- [ ] **Step 1: Create Indeed API route**

Create `dashboard/src/app/api/search-indeed/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { parseIndeedResults } from "@/lib/parsers/indeed"

export async function POST(req: NextRequest) {
  try {
    const { keyword, location } = await req.json()

    if (!keyword || !location) {
      return NextResponse.json(
        { error: "keyword and location are required" },
        { status: 400 }
      )
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system:
          "You are a job search assistant. Use the Indeed MCP tool to search for jobs. Return the raw results exactly as the tool provides them. Do not add commentary.",
        messages: [
          {
            role: "user",
            content: `Search Indeed for "${keyword}" jobs in "${location}" in the US. Return all results.`,
          },
        ],
        mcp_servers: [
          {
            type: "url",
            url: "https://mcp.indeed.com/claude/mcp",
            name: "indeed",
          },
        ],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json(
        { jobs: [], source: "Indeed", count: 0, error: "Search service unavailable" },
        { status: 502 }
      )
    }

    const data = await resp.json()
    const allText =
      data.content
        ?.map((b: { type: string; text?: string; content?: { text?: string }[] }) => {
          if (b.type === "text") return b.text || ""
          if (b.type === "mcp_tool_result")
            return b.content?.map((c) => c.text || "").join("\n") || ""
          return ""
        })
        .join("\n") || ""

    const jobs = parseIndeedResults(allText)

    return NextResponse.json({
      jobs,
      source: "Indeed",
      count: jobs.length,
    })
  } catch (error) {
    console.error("Indeed search error:", error)
    return NextResponse.json(
      { jobs: [], source: "Indeed", count: 0, error: "MCP timeout" },
      { status: 200 }
    )
  }
}
```

- [ ] **Step 2: Create Dice API route**

Create `dashboard/src/app/api/search-dice/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { parseDiceResults } from "@/lib/parsers/dice"

export async function POST(req: NextRequest) {
  try {
    const { keyword, location, contractOnly } = await req.json()

    if (!keyword || !location) {
      return NextResponse.json(
        { error: "keyword and location are required" },
        { status: 400 }
      )
    }

    const filterNote = contractOnly
      ? " Filter for contract positions only."
      : ""

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system:
          "You are a job search assistant. Use the Dice MCP tool to search for jobs. Return the raw tool results exactly as provided in JSON format. Do not add commentary or reformatting.",
        messages: [
          {
            role: "user",
            content: `Search Dice for "${keyword}" jobs near "${location}" within 50 miles. Return 10 results.${filterNote} Return the raw JSON.`,
          },
        ],
        mcp_servers: [
          {
            type: "url",
            url: "https://mcp.dice.com/mcp",
            name: "dice",
          },
        ],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json(
        { jobs: [], source: "Dice", count: 0, error: "Search service unavailable" },
        { status: 502 }
      )
    }

    const data = await resp.json()
    const allText =
      data.content
        ?.map((b: { type: string; text?: string; content?: { text?: string }[] }) => {
          if (b.type === "text") return b.text || ""
          if (b.type === "mcp_tool_result")
            return b.content?.map((c) => c.text || "").join("\n") || ""
          return ""
        })
        .join("\n") || ""

    const jobs = parseDiceResults(allText)

    return NextResponse.json({
      jobs,
      source: "Dice",
      count: jobs.length,
    })
  } catch (error) {
    console.error("Dice search error:", error)
    return NextResponse.json(
      { jobs: [], source: "Dice", count: 0, error: "MCP timeout" },
      { status: 200 }
    )
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd F:/Projects/CareerPilot/dashboard
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/app/api/
git commit -m "feat(SCRUM-110): add search-indeed and search-dice API routes with MCP integration"
```

---

## Task 11: Login Page (SCRUM-113)

**Files:**
- Create: `dashboard/src/app/login/page.tsx`

- [ ] **Step 1: Create login page**

Create `dashboard/src/app/login/page.tsx`:
```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-zinc-200 p-8 w-full max-w-sm shadow-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-lg text-zinc-900">
            CP
          </div>
          <div>
            <div className="font-bold text-lg">Career Pilot</div>
            <div className="text-xs text-zinc-500 font-mono">v2.0</div>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-600 block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm border border-zinc-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 block mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm border border-zinc-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              required
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/app/login/
git commit -m "feat(SCRUM-113): add login page with Supabase Auth"
```

---

## Task 12: View Pages — Overview, Search, Applications, Analytics

This is the largest task. Build each view page by composing the shared components and hooks.

**Files:**
- Create: `dashboard/src/components/dashboard/pipeline-chart.tsx`
- Create: `dashboard/src/components/dashboard/weekly-chart.tsx`
- Create: `dashboard/src/components/dashboard/activity-feed.tsx`
- Create: `dashboard/src/components/search/profile-chips.tsx`
- Create: `dashboard/src/components/search/search-controls.tsx`
- Create: `dashboard/src/hooks/use-search.ts`
- Create: `dashboard/src/components/applications/application-row.tsx`
- Create: `dashboard/src/components/applications/kanban-summary.tsx`
- Create: `dashboard/src/components/applications/add-form.tsx`
- Create: `dashboard/src/components/analytics/source-chart.tsx`
- Create: `dashboard/src/components/analytics/pipeline-funnel.tsx`
- Create: `dashboard/src/components/analytics/timeline-chart.tsx`
- Modify: `dashboard/src/app/page.tsx`
- Modify: `dashboard/src/app/search/page.tsx`
- Modify: `dashboard/src/app/applications/page.tsx`
- Modify: `dashboard/src/app/analytics/page.tsx`

This task is large enough that the implementing agent should break it into sub-steps per view. The recommended order:

- [ ] **Step 1: Build Overview view components**

Create the three Overview-specific components:
- `pipeline-chart.tsx` — Recharts PieChart with inner donut, reads from applications prop
- `weekly-chart.tsx` — Recharts AreaChart, 6-week window, computed from applications dates
- `activity-feed.tsx` — Lists last 8 activity_log entries, uses `fetchRecentActivity()`

Update `dashboard/src/app/page.tsx` to compose: Header + 4 KpiCards + PipelineChart + WeeklyChart + ActivityFeed. The page should use `useApplications()` and pass data to child components.

- [ ] **Step 2: Verify Overview renders**

```bash
cd F:/Projects/CareerPilot/dashboard
npm run dev
```

Open `http://localhost:3000`. Verify KPI cards show (with zeros), charts render empty states, activity feed shows placeholder.

- [ ] **Step 3: Commit Overview**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/components/dashboard/ dashboard/src/app/page.tsx
git commit -m "feat(SCRUM-108): build Overview page with KPI cards, charts, and activity feed"
```

- [ ] **Step 4: Build use-search hook**

Create `dashboard/src/hooks/use-search.ts`. This hook orchestrates:
- Profile selection state (`selectedProfiles: Set<string>`)
- `runSearch()` — sequential calls to `/api/search-indeed` and `/api/search-dice` per profile
- Progress tracking (`loading`, `currentProfile`, `completed/total`)
- Abort support via `useRef`
- Applies `deduplicateJobs()` and `filterIrrelevant()` from search-utils
- Calls `deduplicateAgainstCache()` against recent `search_cache` entries
- Writes to `search_cache` table after each profile (including 0 results)
- Returns: `{ searchResults, selectedProfiles, toggleProfile, runSearch, stopSearch, loading, progress, searchComplete }`

Reference the JSX prototype's `JobSearchView` component (lines 322-431 of `career_pilot_dashboard.jsx`) for the exact orchestration pattern.

- [ ] **Step 5: Build Search view components**

Create:
- `profile-chips.tsx` — 8 toggleable chip buttons, All/None shortcuts
- `search-controls.tsx` — Run/Stop buttons with progress indicator

Update `dashboard/src/app/search/page.tsx` to compose: ProfileChips + SearchControls + SearchStatus bar + JobCard list. Wire up `useSearch()` hook. Track button calls `addApplication(job, "search")`.

- [ ] **Step 6: Verify Search page**

```bash
npm run dev
```

Navigate to `/search`. Verify: profile chips render, Run button is clickable (will fail without real API key — that's fine), layout looks correct.

- [ ] **Step 7: Commit Search**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/hooks/use-search.ts dashboard/src/components/search/ dashboard/src/app/search/
git commit -m "feat(SCRUM-110): build Job Search page with profile chips, search hook, and results"
```

- [ ] **Step 8: Build Applications view components**

Create:
- `application-row.tsx` — Shows title, company, StatusBadge, status dropdown, edit notes, delete
- `kanban-summary.tsx` — 9 status cards in `grid-cols-3 lg:grid-cols-5`, clickable to filter
- `add-form.tsx` — Collapsible manual entry form (title, company, location, url required fields)

Update `dashboard/src/app/applications/page.tsx` to compose: TrackerControls (filter + sort + Add Manual) + KanbanSummary + AddForm + ApplicationRow list. Wire up `useApplications()`. Status dropdown triggers `updateApplication()`. Delete triggers `deleteApplication()`.

- [ ] **Step 9: Verify Applications page**

```bash
npm run dev
```

Navigate to `/applications`. Verify: kanban summary shows 9 status cards, Add Manual form expands/collapses, empty state renders.

- [ ] **Step 10: Commit Applications**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/components/applications/ dashboard/src/app/applications/
git commit -m "feat(SCRUM-111): build Applications page with kanban summary, CRUD, and manual add"
```

- [ ] **Step 11: Build Analytics view components**

Create:
- `source-chart.tsx` — Recharts BarChart from `stats.source_distribution`
- `pipeline-funnel.tsx` — Horizontal bars per status with percentage widths
- `timeline-chart.tsx` — Recharts LineChart, last 14 days of applications

Update `dashboard/src/app/analytics/page.tsx` to compose: 4 KpiCards + SourceChart + PipelineFunnel + ApplicationTimeline. Data from `useApplications()` + `useStats()`.

- [ ] **Step 12: Verify Analytics page**

```bash
npm run dev
```

Navigate to `/analytics`. Verify: KPI cards render, charts show empty states, layout is correct.

- [ ] **Step 13: Commit Analytics**

```bash
cd F:/Projects/CareerPilot
git add dashboard/src/components/analytics/ dashboard/src/app/analytics/
git commit -m "feat(SCRUM-112): build Analytics page with source, funnel, and timeline charts"
```

---

## Task 13: Integration Wiring & Full Test (SCRUM-115)

**Files:**
- Modify: `dashboard/src/app/layout.tsx` (add Header with live counts)

- [ ] **Step 1: Wire Header into layout with live application counts**

Update `dashboard/src/app/layout.tsx` to make the main content area a client component wrapper that uses `useApplications()` and passes `activeCount`/`totalCount` to `<Header />`.

- [ ] **Step 2: Run full test suite**

```bash
cd F:/Projects/CareerPilot/dashboard
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Walk through all 4 views:
1. Overview — KPI cards, charts, activity feed
2. Search — Profile chips, run search (with API key), track a job
3. Applications — See tracked job, change status, add manually, delete
4. Analytics — Charts reflect application data

- [ ] **Step 5: Commit**

```bash
cd F:/Projects/CareerPilot
git add dashboard/
git commit -m "feat(SCRUM-115): wire header counts, full integration test, build verification"
```

---

## Task 14: Deployment Setup (SCRUM-114)

**Files:**
- No new files — Vercel configuration via dashboard

- [ ] **Step 1: Push to GitHub**

```bash
cd F:/Projects/CareerPilot
git push origin master
```

- [ ] **Step 2: Connect to Vercel**

1. Go to vercel.com, import the `jlfowler1084/CareerPilot` repo
2. Set **Root Directory** to `dashboard`
3. Framework preset: Next.js (auto-detected)
4. Add environment variables:
   - `ANTHROPIC_API_KEY` = your key
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
5. Deploy

- [ ] **Step 3: Create Supabase user**

In Supabase Dashboard → Authentication → Users → Create user with email/password. This is your single auto-login account.

- [ ] **Step 4: Run schema migration**

In Supabase Dashboard → SQL Editor → paste contents of `dashboard/supabase/migrations/001_initial_schema.sql` → Run.

- [ ] **Step 4b: Enable Realtime on applications table**

In Supabase Dashboard → Database → Replication, enable Realtime for the `applications` table. Alternatively, run in SQL Editor:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE applications;
```
This is required for the `use-applications` hook's real-time subscription to work.

- [ ] **Step 5: Test deployed app**

1. Open the Vercel URL
2. Login with the Supabase user credentials
3. Run a job search — **test specifically whether it completes within 10s or hits the Vercel timeout**
4. Track a job, verify it appears in Applications
5. Check Analytics view reflects the data

- [ ] **Step 6: Document deployment URL**

If deployment succeeds, note the Vercel URL. If the 10-second timeout is hit on search, document the behavior and flag for SCRUM-115 (streaming or Pro upgrade).

- [ ] **Step 7: Commit any deployment config changes**

```bash
cd F:/Projects/CareerPilot
git add -A && git status
# Only commit if there are non-sensitive changes (e.g., next.config.ts tweaks)
git commit -m "feat(SCRUM-114): Vercel deployment configuration"
git push origin master
```

---

## Summary

| Task | SCRUM | What |
|------|-------|------|
| 1 | 107 | Scaffold Next.js + Shadcn + Vitest |
| 2 | 107 | Types + Constants |
| 3 | 109 | Supabase client + schema SQL |
| 4 | 110 | Parsers + search utilities (TDD) |
| 5 | 108 | Sidebar + Header + routing |
| 6 | 108 | Shared UI components (KpiCard, StatusBadge, JobCard) |
| 7 | 111 | use-activity-log hook |
| 8 | 111 | use-applications hook (CRUD + dates + real-time) |
| 9 | 112 | use-stats hook (TDD, mirrors Python) |
| 10 | 110 | API routes (search-indeed, search-dice) |
| 11 | 113 | Login page |
| 12 | 108-112 | All 4 view pages + remaining components |
| 13 | 115 | Integration wiring + build verification |
| 14 | 114 | Vercel deployment + Supabase setup |
