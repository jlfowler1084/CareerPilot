# Test Hints — CareerPilot Dashboard

## How to Use

1. Read the Discord update for the Jira ticket ID (format: `[CAR-XXX]`)
2. Look up the ticket in Jira for full context (Atlassian MCP: `getJiraIssue`)
3. Find the matching feature section below
4. Follow the verification steps
5. Report results back to the Discord channel

## Access

- **Production:** https://career-pilot-two-ivory.vercel.app
- **Local dev:** http://localhost:3000 (if dev server is running)
- **Project files:** /Volumes/VMware Shared Folders/Projects/CareerPilot/dashboard/
- **Supabase project:** `kfrffocrfnnuimwrngcs`
- **Branch:** `feature/dashboard-v2`

## Authentication

All pages except `/login` require Supabase authentication. If redirected to `/login`, sign in with the configured credentials. Auth is managed by `auth-context.tsx` using `useAuth()` context.

- Navigate to the dashboard root URL
- Verify redirect to `/login` if not authenticated
- Verify email/password fields render
- Login should redirect to the Overview page
- Verify sidebar shows user info after login

---

## Features

### Sidebar Navigation (CAR-108, CAR-85)

- Verify sidebar renders with all navigation links:
  - Overview
  - Inbox
  - Job Search
  - Applications
  - Auto-Apply (with Rocket icon)
  - Conversations
  - Analytics
  - Interview Prep
  - Settings
- Verify sidebar is collapsible
- Verify Auto-Apply link shows emerald badge with approved queue count
- Verify badge count updates in real-time when queue items change
- Verify clicking each link navigates to the correct page

### Overview Page

- Navigate to `/` or `/overview`
- Verify header shows current date
- Verify KPI stats cards render (applications, interviews, etc.)
- Verify "This Week" activity section shows data
- Verify weekly activity sparkline/area chart renders with 7-day data
- Verify chart shows daily application counts with amber fill
- Hover over chart points — tooltip should show count

### Inbox / Email (CAR-70, CAR-76, CAR-92, CAR-97)

- Navigate to `/inbox`
- Verify email list loads (not stuck on skeleton loading)
- Verify category filter chips render (recruiter_outreach, interview_request, follow_up, offer, job_alert, rejection, irrelevant)
- Click each category chip — list should filter to that category
- Click "Conversations" preset — should show only human email categories
- Verify "Hide Subscriptions" toggle works
- Verify "Group by Company" toggle groups emails by domain
- Verify sort dropdown (Newest/Oldest) works and persists
- **Scan Gmail:** Click "Scan Gmail" or "Scan Now" button
  - Verify scan initiates (loading indicator appears)
  - Verify new emails appear after scan completes
  - If scan fails with 401 — Gmail OAuth refresh token may need regeneration
- **Email detail:** Click an email card
  - Verify detail panel opens with full email content
  - Verify thread view shows if email is part of a conversation
  - Verify thread messages display in chronological order
- **Email linking (CAR-92):** In email detail panel
  - Verify "Link to Application" option exists
  - Verify thread-level email linking modal groups by `thread_id`
  - Verify linked emails show link badge
- **Auto-track badges (CAR-76):** Verify emails show auto-track status badges (tracked, prompted, skipped)

### Job Search (CAR-110, CAR-72)

- Navigate to `/search`
- Verify search profile chips render with emoji icons
- Verify at least these profiles exist: Sys Admin — Indy, Systems Engineer — Indy, DevOps / Cloud — Indy, PowerShell / Automation — Remote, Infrastructure — Remote, MSP / IT Services — Indy, Contract — Infrastructure, Active Directory / Identity — Remote
- Select a profile and run a search
- Verify results load from Indeed and/or Dice (depending on profile source)
- Verify job cards display: title, company, location, salary, source badge, posted date
- Verify fit scores appear on job cards (color-coded: green 85+, amber 70-84, red <70)
- Verify duplicate job cards are filtered out
- Verify irrelevant jobs are filtered (no pest control, HVAC, etc.)
- Verify "Track" button adds job to Applications
- Verify "Tailor" button opens Resume Tailoring modal
- Verify "Track + Tailor" does both operations
- **Filters (CAR-72):** Verify filter controls work (keyword, location, source)
- Verify search results are not accessible without auth (API routes return 401 for unauthenticated requests)

### Applications Page

- Navigate to `/applications`
- Verify application list/kanban loads with tracked jobs
- Verify application cards show: job title, company, status, date added
- Verify status can be updated (applied, interviewing, offered, rejected, etc.)
- Verify application detail panel opens on click
- **Coaching Section (CAR-28):** Verify coaching section renders in application detail with score
- **Practice Mode (CAR-28):** Verify practice interview mode is accessible from application detail
- **Cover Letter:** Verify cover letter generation option exists

### Auto-Apply Queue (CAR-85, CAR-18)

- Navigate to `/auto-apply`
- Verify header shows today's date and queue stats (approved/applied/pending counts)
- Verify queue table renders with columns: #, Job Title, Company, Location, Score, Source, Status, URL, Actions
- Verify sort order: approved first → local (Indianapolis) before remote → score descending
- Verify scores are color-coded (green 85+, amber 70-84, red <70)
- Verify local locations are bold
- Verify job URL links are clickable and open in new tab
- Verify Approve/Skip/Reject buttons work and update Supabase
- Verify real-time subscription updates the table when queue changes
- Verify empty state shows "No jobs in queue" with link to search page
- **Cowork readability:** Page must be legible at 1280x1024 resolution (the macOS VM display size)

### Conversations (CAR-39, CAR-87, CAR-88)

- Navigate to `/conversations`
- Verify conversation log list loads
- **Conversation Log Form (CAR-87):** 
  - Verify form is accessible to create a new conversation log
  - Enter a conversation and submit
  - Verify AI debrief analysis generates (powered by Haiku)
  - Verify debrief content appears after submission
- **Discuss in SecondBrain (CAR-88):**
  - Verify "Discuss in SecondBrain" button appears on conversation entries
  - Verify button triggers the SecondBrain integration

### Analytics Page

- Navigate to `/analytics`
- Verify charts render (application pipeline, response rates, etc.)
- Verify data reflects actual application data from Supabase
- Verify Recharts components load without errors

### Interview Prep (CAR-96)

- Navigate to `/interview-prep` (or equivalent route)
- Verify interview prep page loads without infinite loop (CAR-96 fix)
- Verify 90-second AbortController timeout works (page doesn't hang indefinitely)
- If generating prep materials, verify they complete within timeout
- Verify interview history is accessible
- Verify interview comparison/trend analysis works

### Settings Page (CAR-18)

- Navigate to `/settings`
- Verify settings page loads
- **Skills Inventory Editor:** Verify skills list renders (should have 16+ skills)
  - Verify skills can be added/edited/removed
- **Screening Answers Editor:** Verify screening Q&A patterns render (should have 20+ patterns)
  - Verify answers can be added/edited/removed
- Verify settings save to Supabase successfully

### Resume Tailoring (CAR-38)

- From a job search result or application, click "Tailor Resume"
- Verify tailoring modal opens
- Verify AI generates a tailored resume based on the job description
- Verify generated resume can be saved/downloaded

### Cover Letter (CAR-22)

- Verify cover letter generation API route exists at `/api/cover-letter`
- From an application, trigger cover letter generation
- Verify AI generates a cover letter

---

## API Routes (filesystem verification)

Check that these API route files exist in the project:

| Route | File Path | Auth Required |
|-------|-----------|---------------|
| Tailor Resume | `app/api/tailor-resume/route.ts` | Yes |
| Cover Letter | `app/api/cover-letter/route.ts` | Yes |
| Search Indeed | `app/api/search-indeed/route.ts` | Yes |
| Search Dice | `app/api/search-dice/route.ts` | Yes |
| Calendar Sync | `app/api/calendar-sync/route.ts` | Yes |
| Gmail Scan | `app/api/gmail/scan/route.ts` | Yes |
| Gmail Classify | `app/api/gmail/classify/route.ts` | Yes |
| Gmail Message | `app/api/gmail/message/route.ts` | Yes |
| Gmail Thread | `app/api/gmail/thread/route.ts` | Yes |
| Email Status | `app/api/email-status/route.ts` | Yes |
| Intelligence | `app/api/intelligence/generate/route.ts` | Yes |

---

## Regression Checks

These are automated checks that can be run from the project directory:

```bash
# Run regression check script (verifies all 84 manifest features exist)
cd /Volumes/VMware\ Shared\ Folders/Projects/CareerPilot/dashboard
bash tools/regression-check.sh

# Run test suite (148 tests across 18 test files)
npx vitest run

# TypeScript type check
npx tsc --noEmit

# Build verification
npm run build
```

All four checks should pass cleanly. If regression-check.sh reports missing features, that indicates a file was accidentally deleted or renamed.

---

## Common Failure Patterns

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Inbox stuck on skeleton loading | Auth token expired or middleware missing | Check `middleware.ts` exists; regenerate Gmail OAuth token |
| Scan Gmail button does nothing | Silent auth error in `use-emails.ts` | Check browser console for errors; verify `useAuth()` returns valid user |
| 401 on Vercel but works locally | Supabase session not refreshing server-side | Verify `middleware.ts` is deployed; check Supabase auth logs |
| Zero counts on overview but data exists | RLS policy blocking `auth.uid()` | Check Supabase RLS policies; verify user UUID matches |
| Interview prep hangs | Missing AbortController timeout | CAR-96 fix should be in place; verify 90s timeout in code |
| Auto-apply badge shows 0 | Real-time subscription disconnected | Refresh page; check Supabase realtime is enabled on `auto_apply_queue` |
| CORS errors with null status | Wrong API key format or DNS block | Not a CORS config issue — check env vars |
| Search returns no Indeed results | Indeed MCP intermittent | Retry; check if Dice results come back (different MCP) |

---

## Supabase Tables (for data verification)

Key tables to check when verifying features:

- `applications` — tracked job applications with status pipeline
- `emails` — scanned Gmail messages with classification
- `email_application_links` — links between emails and applications
- `auto_apply_queue` — jobs queued for Cowork auto-apply
- `auto_apply_log` — log of completed auto-apply actions
- `auto_apply_settings` — auto-apply configuration
- `skills_inventory` — user's skills (16+ entries)
- `screening_answers` — pre-filled screening Q&A (20+ patterns)
- `user_settings` — user preferences and configuration
- `conversation_logs` — conversation log entries with AI debriefs

---

*Last updated: April 4, 2026*
*CareerPilot Project — Jira key: CAR*
