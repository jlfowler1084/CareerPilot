# Gmail Inbox Integration Design

**Jira:** SCRUM-145 (Phase 1 of 3)
**Date:** 2026-03-25
**Status:** Draft

## Scope

Phase 1 of SCRUM-145: Gmail email scanning + application linking for the Next.js dashboard.

**In scope:**
- Gmail email scanning with on-load auto-scan + manual refresh
- Claude-powered email classification (7 categories)
- Application linking via domain-matching suggestions with human confirmation
- Top-level Inbox tab in the dashboard UI

**Deferred to later phases:**
- Smart Contact Auto-Discovery & Linking (SCRUM-145 Phase 2) -- will need a Supabase `contacts` table (new) or a bridge to the Python CLI's SQLite contacts table (Phase 10)
- Company Hub / Multi-Application Management (SCRUM-145 Phase 3)
- Embedded "Communications" section in application detail panel (SCRUM-134 follow-up)

## Approach

**Option A: Dashboard only (Next.js API routes + Supabase)**

Chosen over Python backend (deferred to Phase 10) and shared Supabase (unnecessary migration work). Follows the same architecture as the existing dashboard: Next.js API routes handle OAuth-protected external API calls and Claude classification, Supabase stores all data, UI streams results progressively.

The existing Python CLI Gmail scanner (`src/gmail/scanner.py`) stays as-is for terminal use. No code sharing or migration between the two systems.

---

## Data Model

### Migration file

All schema changes below go in a single migration: `004_gmail_inbox.sql` (or the next sequential number at implementation time).

### New table: `emails`

```sql
CREATE TABLE emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  gmail_id TEXT NOT NULL UNIQUE,
  thread_id TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  from_domain TEXT,
  to_email TEXT,
  subject TEXT,
  body_preview TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL DEFAULT 'unclassified',
  classification_json JSONB,
  suggested_application_id UUID REFERENCES applications(id),
  is_read BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_from_email ON emails(from_email);
CREATE INDEX idx_emails_from_domain ON emails(from_domain);
CREATE INDEX idx_emails_category ON emails(category);
CREATE INDEX idx_emails_gmail_id ON emails(gmail_id);
CREATE INDEX idx_emails_thread_id ON emails(thread_id);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own emails" ON emails
  FOR ALL USING (auth.uid() = user_id);
```

### New table: `email_application_links`

```sql
CREATE TABLE email_application_links (
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  linked_by TEXT DEFAULT 'manual',
  linked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (email_id, application_id)
);

ALTER TABLE email_application_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own email links" ON email_application_links
  FOR ALL USING (auth.uid() = user_id);
```

### New table: `user_settings`

```sql
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_email_scan TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);
```

Scan timestamp is updated via upsert: `INSERT INTO user_settings (user_id, last_email_scan) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET last_email_scan = $2, updated_at = now()`.

### `updated_at` trigger

Apply the same auto-update trigger pattern used on other tables:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER emails_updated_at BEFORE UPDATE ON emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Design decisions

- **No `body_full` column.** Full email bodies are fetched from Gmail at classification time, used by Claude, then discarded. Storing them would bloat Supabase free tier storage. If re-classification is ever needed, the body can be re-fetched via `gmail_id`.
- **`from_domain` is a computed/extracted column** (e.g., `cummins.com` extracted from `sarah@cummins.com`). Stored at insert time to support fast domain-matching queries without runtime string parsing.
- **`suggested_application_id`** is computed once during classification (via thread-sibling check, then domain match fallback) and stored. The UI reads this directly rather than re-running match logic on every render.
- **Junction table `email_application_links`** supports one email linking to multiple applications. Handles the real scenario of a staffing agency recruiter emailing about two roles at once.
- **`user_id` on `email_application_links`** for direct RLS policy support, consistent with all other tables in the schema. Avoids subquery-based RLS.
- **`updated_at` on `emails` and `user_settings`** for consistency with all other primary tables and to aid debugging.

### Categories

Eight email states: seven classification categories plus one temporary processing state.

| Category | Description | Claude output? |
|---|---|---|
| `recruiter_outreach` | First-contact recruiter emails | Yes |
| `interview_request` | Interview scheduling or details | Yes |
| `follow_up` | "Checking in", "circling back", status updates on existing conversations | Yes |
| `offer` | Job offer communications | Yes |
| `job_alert` | Automated job alert emails (Indeed, LinkedIn, etc.) | Yes |
| `rejection` | Rejection notices | Yes |
| `irrelevant` | Non-career emails that slipped through | Yes |
| `unclassified` | Temporary state before Claude processes the email | No -- database default only, never returned by Claude |

`follow_up` is distinct from `recruiter_outreach` because follow-ups on existing conversations are the emails most likely to need immediate action and should surface with high visual priority.

### TypeScript Types

```typescript
interface Email {
  id: string
  user_id: string
  gmail_id: string
  thread_id: string | null
  from_email: string
  from_name: string | null
  from_domain: string | null
  to_email: string | null
  subject: string | null
  body_preview: string | null
  received_at: string
  category: EmailCategory
  classification_json: ClassificationResult | null
  suggested_application_id: string | null
  is_read: boolean
  dismissed: boolean
  created_at: string
  updated_at: string
}

type EmailCategory =
  | "recruiter_outreach"
  | "interview_request"
  | "follow_up"
  | "offer"
  | "job_alert"
  | "rejection"
  | "irrelevant"
  | "unclassified"

interface ClassificationResult {
  category: Exclude<EmailCategory, "unclassified">
  company: string | null
  role: string | null
  urgency: "high" | "medium" | "low"
  summary: string
}

interface EmailApplicationLink {
  email_id: string
  application_id: string
  user_id: string
  linked_by: "manual" | "suggested"
  linked_at: string
}

interface UserSettings {
  user_id: string
  last_email_scan: string | null
  created_at: string
  updated_at: string
}
```

---

## Architecture

### Layer split

| Layer | Responsibility |
|---|---|
| **Next.js API routes** (server-side) | Gmail OAuth token refresh, Gmail API calls (metadata + body fetch), MIME parsing, Claude classification |
| **Client-side** (browser) | Supabase reads/writes, suggestion logic, UI rendering, scan orchestration |

API routes handle all external API calls (Gmail + Anthropic). The Anthropic API key stays server-side only, consistent with the existing dashboard pattern (`/api/search-indeed`, `/api/search-dice`, `/api/tailor-resume`, `/api/extract-job`). The client orchestrates the flow and manages Supabase state.

### API Routes

#### `POST /api/gmail/scan`

Fetches new email metadata from Gmail with pagination.

**Input:** `{ since?: string, page_token?: string }` (ISO timestamp; defaults to `last_email_scan`. `page_token` for pagination.)

**Flow:**
1. Read Gmail OAuth refresh token from Vercel env vars (see OAuth section below)
2. Exchange for access token using `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
3. Call Gmail API `messages.list` with query `after:{timestamp}` and `maxResults: 20`
4. For each message ID in the page, fetch headers only (From, Subject, Date, Message-ID, Thread-ID)
5. Return email metadata array + `next_page_token` if more pages exist

**Output:**
```json
{
  "emails": [
    {
      "gmail_id": "18e1a2b3c4d5e6f7",
      "thread_id": "18e1a2b3c4d5e6f0",
      "from_email": "sarah.williams@cummins.com",
      "from_name": "Sarah Williams",
      "from_domain": "cummins.com",
      "subject": "Re: Infrastructure Engineer Role",
      "received_at": "2026-03-25T14:30:00Z"
    }
  ],
  "next_page_token": "abc123" | null
}
```

**Pagination:** Returns max 20 emails per call to stay well within Vercel's 10-second function timeout. The client loops, calling scan with `page_token` until `next_page_token` is null.

**Error handling:** Returns `{ error: string, partial_results?: array }` if Gmail API fails mid-fetch. Client processes whatever was returned.

#### `POST /api/gmail/message`

Fetches full body text for a single email.

**Input:** `{ gmail_id: string }`

**Flow:**
1. Authenticate with Gmail (same token flow as scan)
2. Fetch full message by `gmail_id`
3. Parse MIME structure: prefer `text/plain`, fall back to `text/html` with tag stripping
4. Return plain text body

**Output:** `{ body: string }`

The body is passed to the classify route, then discarded. It is never stored in Supabase.

#### `POST /api/gmail/classify`

Classifies a single email using Claude. Keeps the Anthropic API key server-side.

**Input:** `{ gmail_id: string, from_email: string, from_name?: string, subject?: string, received_at: string, body: string }`

**Flow:**
1. Truncate body to first 3000 chars
2. Call Anthropic API with classification prompt (see Classification Prompt section)
3. Parse and validate JSON response
4. Return classification result

**Output:**
```json
{
  "category": "recruiter_outreach",
  "company": "Cummins",
  "role": "Infrastructure Engineer",
  "urgency": "high",
  "summary": "Recruiter reaching out about an Infrastructure Engineer position in Indianapolis."
}
```

**Error handling:** If Claude returns invalid JSON or the API call fails, return `{ category: "irrelevant", company: null, role: null, urgency: "low", summary: "Classification failed" }` so the pipeline doesn't stall.

### Gmail OAuth

**Single-user setup** matching the existing Calendar integration pattern.

Check whether the existing `GOOGLE_REFRESH_TOKEN` (used by `calendar-sync/route.ts`) was generated with the `gmail.readonly` scope included:
- **If yes:** Reuse `GOOGLE_REFRESH_TOKEN` for both calendar and Gmail API routes. No new env var needed.
- **If no:** Generate a new refresh token that includes both `https://www.googleapis.com/auth/calendar` and `https://www.googleapis.com/auth/gmail.readonly` scopes. Update `GOOGLE_REFRESH_TOKEN` in Vercel env vars with the new token (both calendar and Gmail routes use the same one). Alternatively, store a separate `GMAIL_REFRESH_TOKEN` if you want independent token lifecycle.

API routes exchange the refresh token for short-lived access tokens on each request. No in-app OAuth flow, no `user_tokens` table, no "Connect Gmail" button.

If the refresh token expires or is revoked, the API route returns an auth error and the UI shows a "Gmail disconnected" banner with instructions to re-generate the token.

### Scan-on-Load Flow

```
User opens Inbox tab
  |
  v
Read last_email_scan from Supabase (user_settings table)
  |
  v
Render cached emails immediately (non-blocking)
  |
  v
Check for unclassified rows in Supabase (orphans from interrupted scans)
  |-- If found: resume classification for those first (skip to step 4)
  |-- If none: continue
  |
  v
Is last_email_scan < 15 minutes ago?
  |-- Yes: done, page is current
  |-- No: continue to background scan
  |
  v
1. Call POST /api/gmail/scan (since: last_email_scan)
   Loop with page_token until all pages fetched
2. Dedup: filter out gmail_ids already in Supabase
3. Insert new rows into Supabase (category: 'unclassified', from_domain extracted)
4. For each unclassified email (batches of 10, 1-second delay between batches):
   a. Call POST /api/gmail/message to get full body
   b. Call POST /api/gmail/classify with metadata + body
   c. Generate body_preview (first ~500 chars of body text from step a)
   d. Update Supabase row: category, classification_json, body_preview
   e. Run suggestion logic (see below)
   f. Set suggested_application_id if match found
   g. UI updates reactively as each email is classified
5. Update last_email_scan timestamp in Supabase (upsert)
```

**Key property:** The page renders instantly with cached data. Background scanning and classification are non-blocking. New emails fade in progressively as they're processed.

**Orphan recovery:** If the user closes the tab mid-classification, unclassified rows persist in Supabase. On the next page load, these are detected and classified first, before checking Gmail for new emails. No orphan accumulation.

**Manual Refresh:** The "Refresh" button bypasses the 15-minute cooldown and triggers a full scan from the last scan timestamp (or allows the user to specify a wider date range).

**First-scan bulk handling:** If the first scan pulls 100+ emails, classification happens in batches of 10 with a 1-second delay between batches to avoid Anthropic rate limits. The UI shows a progress indicator: "Classifying 34 of 127 emails..." The user can interact with already-classified emails while the rest process.

### Classification Prompt

Reuses the proven schema from the Python scanner, extended with the `follow_up` category:

**System prompt:**
```
You are an email classifier for a job search dashboard. Classify the email into exactly one category and extract metadata.

Categories:
- recruiter_outreach: First-contact emails from recruiters or staffing agencies about a new role
- interview_request: Interview scheduling, confirmation, or logistics
- follow_up: Follow-ups on existing conversations ("checking in", "circling back", status updates)
- offer: Job offer communications
- job_alert: Automated job alert emails from job boards (Indeed, LinkedIn, Dice, etc.)
- rejection: Rejection or "moved forward with other candidates" notices
- irrelevant: Not related to job searching

Respond with valid JSON only, no other text:
{
  "category": "one of the categories above",
  "company": "company name or null",
  "role": "job title or null",
  "urgency": "high|medium|low",
  "summary": "1-2 sentence summary of the email"
}
```

**User message:** Email metadata (from, subject, date) + full body text (first 3000 chars to manage token budget).

**Model:** `claude-sonnet-4-6` (fast, cheap, sufficient for classification).

**Auto-dismiss:** If Claude classifies an email as `irrelevant`, set `dismissed = true` on the Supabase row. The user can undo this from a "Show dismissed" toggle.

### Suggestion Logic

When an email is classified, compute `suggested_application_id`:

**Priority order:**
1. **Thread siblings first:** Query Supabase for other emails with the same `thread_id` that are already linked to an application (via `email_application_links`). If found, suggest that application. This is the most accurate signal for ongoing conversations.
2. **Domain matching fallback:** If no thread siblings are linked, extract the second-level domain from `from_domain` (e.g., `"cummins"` from `"cummins.com"`) and do a case-insensitive `ILIKE` against `applications.company` (e.g., `company ILIKE '%cummins%'`). If exactly one active application matches, suggest it. If multiple match, suggest nothing (let the user pick from the dropdown).
3. **No match:** Leave `suggested_application_id` as null. The email appears as unlinked in the Inbox.

**Domain matching limitations (Phase 1):** Fuzzy substring matching is imperfect. It will fail for staffing agencies (the recruiter's domain is `@teksystems.com` but the application company is "Cummins"), abbreviations, and name variations. This is acceptable for Phase 1 -- thread-sibling matching handles ongoing conversations accurately, and unmatched emails are easy to link manually. Domain matching can be improved in Phase 2 with a `company_domain` column on `applications`.

---

## Inbox UI

### Navigation

New top-level tab "Inbox" in the dashboard sidebar/nav, same level as Overview, Search, Applications, Analytics. Requires adding an entry to `NAV_ITEMS` in the sidebar component.

### Layout: Two-panel

**Left column: Email list**
**Right column: Persistent detail panel** (opens when an email is selected, stays open as user clicks through emails in the left column)

The persistent right panel (not expand-in-place) is chosen because email triage involves rapid back-and-forth between emails. A right panel lets the user click through emails in the list while the detail view updates without reflowing the list layout.

### Top Bar

- **Tab title:** "Inbox"
- **Scan state subtitle:** "3 new emails . Last scanned 12m ago" or "Scanning..." with a subtle spinner during background scan. During first-scan bulk processing: "Classifying 34 of 127 emails..."
- **Manual "Refresh" button** (right-aligned) -- triggers scan ignoring 15-minute cooldown
- **Filter chips with counts:** `All (24)` | `Recruiter (4)` | `Interview (1)` | `Follow-up (2)` | `Offers (0)` | `Alerts (12)` | `Rejected (3)` | `Unlinked (7)`
  - Maps to category values, plus `Unlinked` filters for emails with no confirmed entry in `email_application_links` (emails with a pending `suggested_application_id` but no confirmed link count as Unlinked)
  - Zero-count chips are visually muted (lower opacity) but remain clickable
  - Counts update reactively as new emails are classified

### Email Cards (Left Column)

Each card displays:
- **Checkbox** (left edge) -- for bulk selection
- **From name + email** (e.g., "Sarah Williams . sarah.williams@cummins.com")
- **Subject line** (bold, truncated to one line)
- **Preview** -- first ~100 chars of `body_preview`
- **Category badge** -- color-coded pill
- **Received timestamp** -- relative format ("2h ago", "Yesterday")
- **Link status indicator:**
  - Linked: small tag showing the linked application title
  - Suggested: subtle dashed outline or highlight indicating a pending suggestion
  - Unlinked: no indicator

**States:**
- Unclassified emails show a pulsing dot or skeleton badge while Claude processes them
- Selected card is highlighted (matches detail panel on the right)
- Dismissed emails hidden by default; toggle "Show dismissed" to reveal them

**Sorting:** `received_at` descending (newest first).

**Bulk actions bar** (appears when checkboxes are selected):
- "{N} selected" count
- "Dismiss selected" button
- "Link selected to..." dropdown (for batch-linking multiple emails to one application)
- "Select all" / "Deselect all"

Bulk dismiss is critical for first-use experience when 50+ emails may be pulled in, many of which are Indeed alerts or LinkedIn notifications.

### Detail Panel (Right Column)

Opens when an email card is clicked. Persists while clicking through different emails.

**Header section:**
- From name + email (full, not truncated)
- Subject line (full)
- Received date (absolute + relative)
- Category badge (large, color-coded)
- Classification metadata from `classification_json`: company, role, urgency, summary

**Body section:**
- Full `body_preview` text (scrollable)

**Linking section (bottom):**
- **If `suggested_application_id` is set:** Dropdown pre-selected to that application. "Link" confirm button + "Not this one" to clear the suggestion.
- **If no suggestion:** Empty dropdown listing all active applications. "Link" button.
- **If already linked:** Shows linked application(s) as tags with an "Unlink" option per link.
- Regardless of suggestion state, the gesture is always the same: review the dropdown, click "Link." No mode-switching.

**Actions:**
- "Dismiss" button -- sets `dismissed = true`, removes from default inbox view
- "Open in Gmail" link -- navigates to `https://mail.google.com/mail/u/0/#inbox/{thread_id}` (thread-based URLs are more reliable than message-based URLs in Gmail's web interface)

### Category Badge Colors

| Category | Color | Rationale |
|---|---|---|
| `recruiter_outreach` | Blue | Informational, primary category |
| `interview_request` | Purple | Distinct from outreach, signals scheduling |
| `follow_up` | Amber/Orange | High visibility -- these need action |
| `offer` | Green | Positive signal |
| `job_alert` | Gray | Automated, low priority |
| `rejection` | Muted red | Negative but not urgent |
| `irrelevant` | Light gray | Lowest priority (auto-dismissed) |
| `unclassified` | Skeleton/pulsing | Temporary, processing state |

Linked emails have a subtle left border matching their linked application's status color.

### Empty States

- **First use (no Gmail token configured):** "Set up Gmail integration to start scanning for job-related emails" + instructions for generating the refresh token and adding it to Vercel env vars
- **No new emails:** "All caught up" message with cached email list below
- **Scan in progress:** Cached emails render instantly; new emails fade in with the same `fadeIn` animation used on job search cards

---

## Integration Points

| Feature | How it connects |
|---|---|
| **Application detail panel (SCRUM-134)** | Phase 2: "Communications" section queries `email_application_links` filtered by `application_id`. Read-only display of linked emails. |
| **Company Intel (SCRUM-140)** | `classification_json.company` can be cross-referenced with company intel cache for context in the detail panel. |
| **Conversation Log (SCRUM-144)** | Linked emails become entries in the application's conversation timeline. |
| **Contact Discovery (SCRUM-145 Phase 2)** | `from_email` and `from_domain` on classified emails feed the auto-suggest contact flow. Will require a Supabase `contacts` table (new) or bridge to Python CLI's SQLite contacts (Phase 10). |
| **Company Hub (SCRUM-145 Phase 3)** | `from_domain` enables grouping all emails by company across applications. |

---

## Cost & Performance

- **Gmail API calls:** Essentially free (Google API quota). Metadata-only scan is lightweight.
- **Claude API calls:** One classification call per genuinely new email. ~500-1000 input tokens per email (metadata + 3000 char body), ~100 output tokens. At Sonnet pricing, roughly $0.002 per email classified.
- **15-minute cooldown** prevents redundant scans when navigating between dashboard tabs.
- **Dedup by `gmail_id`** ensures emails are never classified twice even if they appear in multiple scans.
- **Orphan recovery** ensures no wasted work from interrupted scans -- unclassified rows are picked up on next load.
- **Pagination (20 per page)** keeps each API route call within Vercel's 10-second function timeout.
- **Classification batching (10 at a time, 1s delay)** prevents Anthropic rate limit hits during bulk first-scan scenarios.

---

## Phase 2: Application Detail Integration (Future)

After Phase 1 ships and the data model is validated:

- Add "Communications" section to the application detail panel (SCRUM-134)
- Query `email_application_links` + `emails` filtered by `application_id`
- Display as a chronological thread view within the application context
- Read-only -- linking/unlinking happens in the Inbox view
- Estimated effort: one component + one query, fast follow after Phase 1

---

## Open Questions for Implementation

1. **Gmail search query scope:** The Python scanner uses recruiter-pattern filters. Decide whether the dashboard scanner uses the same filters or scans more broadly (all emails, let Claude classify). Broader scanning catches more but costs more in classification API calls.
2. **Gmail URL format verification:** The spec uses thread-based URLs (`#inbox/{thread_id}`). Verify during implementation that Gmail's web UI correctly resolves these with the thread IDs returned by the API.
