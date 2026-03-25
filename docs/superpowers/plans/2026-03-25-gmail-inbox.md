# Gmail Inbox Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gmail Inbox tab to the CareerPilot dashboard that auto-scans for job-related emails, classifies them with Claude, and lets the user link them to tracked applications.

**Architecture:** Next.js API routes handle Gmail OAuth + Anthropic classification server-side. Client-side hook orchestrates the scan-on-load flow, stores results in Supabase, and drives the Inbox UI. Two-panel layout: email list (left) + detail panel (right).

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + real-time), googleapis, Anthropic API (fetch), vitest, Tailwind CSS, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-25-gmail-inbox-integration-design.md`

**IMPORTANT:** This codebase uses Next.js 16, which has breaking changes from older versions. Before writing any code, read the relevant guide in `node_modules/next/dist/docs/` per the project's AGENTS.md.

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `dashboard/supabase/migrations/005_gmail_inbox.sql` | emails, email_application_links, user_settings tables + RLS + indexes + triggers |
| `dashboard/src/types/email.ts` | Email, EmailCategory, ClassificationResult, EmailApplicationLink, UserSettings types |
| `dashboard/src/app/api/gmail/scan/route.ts` | Gmail OAuth token refresh + paginated email metadata fetch |
| `dashboard/src/app/api/gmail/message/route.ts` | Fetch single email body by gmail_id |
| `dashboard/src/app/api/gmail/classify/route.ts` | Claude classification of a single email |
| `dashboard/src/lib/gmail/auth.ts` | Shared Gmail OAuth helper (create authenticated Gmail client) |
| `dashboard/src/lib/gmail/parse.ts` | MIME body extraction helper |
| `dashboard/src/hooks/use-emails.ts` | Email state management, scan-on-load logic, linking, suggestions |
| `dashboard/src/app/(main)/inbox/page.tsx` | Inbox page shell |
| `dashboard/src/components/inbox/email-list.tsx` | Left column: email cards + bulk actions |
| `dashboard/src/components/inbox/email-card.tsx` | Individual email card component |
| `dashboard/src/components/inbox/email-detail.tsx` | Right column: detail panel + linking UI |
| `dashboard/src/components/inbox/filter-chips.tsx` | Category filter chips with counts |
| `dashboard/src/components/inbox/category-badge.tsx` | Color-coded category badge |
| `dashboard/src/components/inbox/bulk-actions.tsx` | Bulk selection action bar |
| `dashboard/src/__tests__/lib/gmail/parse.test.ts` | Tests for MIME parsing |
| `dashboard/src/__tests__/lib/gmail/suggestions.test.ts` | Tests for suggestion logic |

### Modified files

| File | Change |
|------|--------|
| `dashboard/src/types/index.ts` | Re-export email types |
| `dashboard/src/components/layout/sidebar.tsx` | Add Inbox nav item |
| `dashboard/package.json` | Add `googleapis` dependency |

---

## Task 1: Install googleapis + Add TypeScript Types

**Files:**
- Modify: `dashboard/package.json`
- Create: `dashboard/src/types/email.ts`
- Modify: `dashboard/src/types/index.ts`

- [ ] **Step 1: Install googleapis**

```bash
cd dashboard && npm install googleapis
```

- [ ] **Step 2: Create email types file**

Create `dashboard/src/types/email.ts`:

```typescript
export type EmailCategory =
  | "recruiter_outreach"
  | "interview_request"
  | "follow_up"
  | "offer"
  | "job_alert"
  | "rejection"
  | "irrelevant"
  | "unclassified"

export interface ClassificationResult {
  category: Exclude<EmailCategory, "unclassified">
  company: string | null
  role: string | null
  urgency: "high" | "medium" | "low"
  summary: string
}

export interface Email {
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

export interface EmailApplicationLink {
  email_id: string
  application_id: string
  user_id: string
  linked_by: "manual" | "confirmed_suggestion"
  linked_at: string
}

export interface UserSettings {
  user_id: string
  last_email_scan: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Re-export from index.ts**

Add to the end of `dashboard/src/types/index.ts`:

```typescript
export type {
  Email,
  EmailCategory,
  ClassificationResult,
  EmailApplicationLink,
  UserSettings,
} from "./email"
```

- [ ] **Step 4: Verify types compile**

```bash
cd dashboard && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: no errors related to email types.

- [ ] **Step 5: Commit**

```bash
git add dashboard/package.json dashboard/package-lock.json dashboard/src/types/email.ts dashboard/src/types/index.ts
git commit -m "feat(inbox): add googleapis dep + email TypeScript types"
```

---

## Task 2: Supabase Migration

**Files:**
- Create: `dashboard/supabase/migrations/005_gmail_inbox.sql`

- [ ] **Step 1: Create migration file**

Create `dashboard/supabase/migrations/005_gmail_inbox.sql`:

```sql
-- Gmail Inbox Integration (SCRUM-145 Phase 1)

-- Emails table
CREATE TABLE emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_id TEXT NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_emails_user_gmail ON emails(user_id, gmail_id);
CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_from_email ON emails(from_email);
CREATE INDEX idx_emails_from_domain ON emails(from_domain);
CREATE INDEX idx_emails_category ON emails(category);
CREATE INDEX idx_emails_thread_id ON emails(thread_id);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own emails" ON emails
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER emails_updated
  BEFORE UPDATE ON emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Email-to-Application links (junction table)
CREATE TABLE email_application_links (
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_by TEXT DEFAULT 'manual',
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email_id, application_id)
);

CREATE INDEX idx_eal_application_id ON email_application_links(application_id);

ALTER TABLE email_application_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own email links" ON email_application_links
  FOR ALL USING (auth.uid() = user_id);

-- User settings (scan state)
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_email_scan TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER user_settings_updated
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Apply migration to Supabase**

```bash
cd dashboard && npx supabase db push
```

Or if using the Supabase MCP, apply via SQL editor. Verify all three tables exist with:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('emails', 'email_application_links', 'user_settings');
```

Expected: 3 rows returned.

- [ ] **Step 3: Commit**

```bash
git add dashboard/supabase/migrations/005_gmail_inbox.sql
git commit -m "feat(inbox): add emails, email_application_links, user_settings tables"
```

---

## Task 3: Gmail Auth Helper + MIME Parser

**Files:**
- Create: `dashboard/src/lib/gmail/auth.ts`
- Create: `dashboard/src/lib/gmail/parse.ts`
- Create: `dashboard/src/__tests__/lib/gmail/parse.test.ts`

- [ ] **Step 1: Write MIME parser tests**

Create `dashboard/src/__tests__/lib/gmail/parse.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { extractBody, extractDomain } from "@/lib/gmail/parse"

describe("extractBody", () => {
  it("returns plain text from text/plain part", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: Buffer.from("Hello world").toString("base64url") },
      parts: undefined,
    }
    expect(extractBody(payload)).toBe("Hello world")
  })

  it("prefers text/plain over text/html in multipart", () => {
    const payload = {
      mimeType: "multipart/alternative",
      body: { data: undefined },
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from("Plain text").toString("base64url") },
        },
        {
          mimeType: "text/html",
          body: { data: Buffer.from("<p>HTML</p>").toString("base64url") },
        },
      ],
    }
    expect(extractBody(payload)).toBe("Plain text")
  })

  it("strips HTML tags when only text/html available", () => {
    const payload = {
      mimeType: "text/html",
      body: { data: Buffer.from("<p>Hello <b>world</b></p>").toString("base64url") },
      parts: undefined,
    }
    expect(extractBody(payload)).toBe("Hello world")
  })

  it("returns empty string for missing body data", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: undefined },
      parts: undefined,
    }
    expect(extractBody(payload)).toBe("")
  })
})

describe("extractDomain", () => {
  it("extracts domain from email address", () => {
    expect(extractDomain("sarah@cummins.com")).toBe("cummins.com")
  })

  it("handles angle-bracket format", () => {
    expect(extractDomain("Sarah Williams <sarah@cummins.com>")).toBe("cummins.com")
  })

  it("returns null for invalid input", () => {
    expect(extractDomain("no-at-sign")).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd dashboard && npx vitest run src/__tests__/lib/gmail/parse.test.ts
```

Expected: FAIL — modules do not exist yet.

- [ ] **Step 3: Implement MIME parser**

Create `dashboard/src/lib/gmail/parse.ts`:

```typescript
interface GmailPart {
  mimeType: string
  body: { data?: string }
  parts?: GmailPart[]
}

export function extractBody(payload: GmailPart): string {
  // Try plain text first
  const plain = findPart(payload, "text/plain")
  if (plain?.body?.data) {
    return decodeBase64Url(plain.body.data)
  }

  // Fall back to HTML with tag stripping
  const html = findPart(payload, "text/html")
  if (html?.body?.data) {
    return stripHtml(decodeBase64Url(html.body.data))
  }

  return ""
}

function findPart(payload: GmailPart, mimeType: string): GmailPart | null {
  if (payload.mimeType === mimeType && payload.body?.data) {
    return payload
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPart(part, mimeType)
      if (found) return found
    }
  }
  return null
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(base64, "base64").toString("utf-8")
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function extractDomain(emailOrHeader: string): string | null {
  // Handle "Name <email@domain.com>" format
  const angleMatch = emailOrHeader.match(/<([^>]+)>/)
  const email = angleMatch ? angleMatch[1] : emailOrHeader

  const atIndex = email.indexOf("@")
  if (atIndex === -1) return null

  return email.slice(atIndex + 1).toLowerCase().trim()
}

export function extractPreview(body: string, maxLength = 500): string {
  return body.slice(0, maxLength)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && npx vitest run src/__tests__/lib/gmail/parse.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Implement Gmail auth helper**

Create `dashboard/src/lib/gmail/auth.ts`:

```typescript
import { google } from "googleapis"

export function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  // Use GMAIL_REFRESH_TOKEN if set, otherwise fall back to shared GOOGLE_REFRESH_TOKEN
  const refreshToken =
    process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN

  if (!refreshToken) {
    throw new Error("No Gmail refresh token configured. Set GMAIL_REFRESH_TOKEN or GOOGLE_REFRESH_TOKEN in env vars.")
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken })

  return google.gmail({ version: "v1", auth: oauth2Client })
}
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/gmail/auth.ts dashboard/src/lib/gmail/parse.ts dashboard/src/__tests__/lib/gmail/parse.test.ts
git commit -m "feat(inbox): Gmail auth helper + MIME body parser with tests"
```

---

## Task 4: POST /api/gmail/scan Route

**Files:**
- Create: `dashboard/src/app/api/gmail/scan/route.ts`

- [ ] **Step 1: Create the scan route**

Create `dashboard/src/app/api/gmail/scan/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getGmailClient } from "@/lib/gmail/auth"
import { extractDomain } from "@/lib/gmail/parse"

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { since, page_token } = await req.json()
    if (!since) {
      return NextResponse.json({ error: "since is required" }, { status: 400 })
    }

    const gmail = getGmailClient()

    // Convert ISO timestamp to Gmail query format (epoch seconds)
    const afterEpoch = Math.floor(new Date(since).getTime() / 1000)

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: `after:${afterEpoch}`,
      maxResults: 20,
      pageToken: page_token || undefined,
    })

    const messageIds = listResponse.data.messages || []
    const emails = []

    for (const msg of messageIds) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      })

      const headers = detail.data.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ""

      const fromRaw = getHeader("From")
      const fromNameMatch = fromRaw.match(/^([^<]+)</)
      const fromEmailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([^\s]+@[^\s]+)/)

      const fromEmail = fromEmailMatch?.[1]?.trim() || fromRaw
      const fromName = fromNameMatch?.[1]?.trim() || null

      emails.push({
        gmail_id: msg.id!,
        thread_id: msg.threadId || null,
        from_email: fromEmail,
        from_name: fromName,
        from_domain: extractDomain(fromEmail),
        to_email: getHeader("To") || null,
        subject: getHeader("Subject") || null,
        received_at: detail.data.internalDate
          ? new Date(parseInt(detail.data.internalDate)).toISOString()
          : new Date(getHeader("Date")).toISOString(),
      })
    }

    return NextResponse.json({
      emails,
      next_page_token: listResponse.data.nextPageToken || null,
    })
  } catch (error) {
    console.error("Gmail scan error:", error)
    return NextResponse.json(
      { error: "Gmail scan failed", emails: [], next_page_token: null },
      { status: 502 }
    )
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd dashboard && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/app/api/gmail/scan/route.ts
git commit -m "feat(inbox): POST /api/gmail/scan — paginated email metadata fetch"
```

---

## Task 5: POST /api/gmail/message Route

**Files:**
- Create: `dashboard/src/app/api/gmail/message/route.ts`

- [ ] **Step 1: Create the message route**

Create `dashboard/src/app/api/gmail/message/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getGmailClient } from "@/lib/gmail/auth"
import { extractBody } from "@/lib/gmail/parse"

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { gmail_id } = await req.json()
    if (!gmail_id) {
      return NextResponse.json({ error: "gmail_id is required" }, { status: 400 })
    }

    const gmail = getGmailClient()

    const message = await gmail.users.messages.get({
      userId: "me",
      id: gmail_id,
      format: "full",
    })

    const body = extractBody(message.data.payload as any)

    return NextResponse.json({ body })
  } catch (error) {
    console.error("Gmail message fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch email body", body: "" },
      { status: 502 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/gmail/message/route.ts
git commit -m "feat(inbox): POST /api/gmail/message — fetch single email body"
```

---

## Task 6: POST /api/gmail/classify Route

**Files:**
- Create: `dashboard/src/app/api/gmail/classify/route.ts`

- [ ] **Step 1: Create the classify route**

Create `dashboard/src/app/api/gmail/classify/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { ClassificationResult } from "@/types/email"

const CLASSIFY_SYSTEM_PROMPT = `You are an email classifier for a job search dashboard. Classify the email into exactly one category and extract metadata.

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
}`

const FALLBACK_RESULT: ClassificationResult = {
  category: "irrelevant",
  company: null,
  role: null,
  urgency: "low",
  summary: "Classification failed",
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { from_email, from_name, subject, received_at, body } = await req.json()

    if (!body) {
      return NextResponse.json(FALLBACK_RESULT)
    }

    const truncatedBody = body.slice(0, 3000)

    const userMessage = `From: ${from_name || ""} <${from_email || "unknown"}>
Subject: ${subject || "(no subject)"}
Date: ${received_at || "unknown"}

${truncatedBody}`

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    })

    if (!resp.ok) {
      console.error("Anthropic API error:", resp.status)
      return NextResponse.json(FALLBACK_RESULT)
    }

    const data = await resp.json()
    const text = data.content?.[0]?.text || ""

    // Strip markdown fences if present
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

    const parsed = JSON.parse(jsonStr) as ClassificationResult
    // Validate category
    const validCategories = [
      "recruiter_outreach", "interview_request", "follow_up",
      "offer", "job_alert", "rejection", "irrelevant",
    ]
    if (!validCategories.includes(parsed.category)) {
      return NextResponse.json(FALLBACK_RESULT)
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Classification error:", error)
    return NextResponse.json(FALLBACK_RESULT)
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd dashboard && npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/app/api/gmail/classify/route.ts
git commit -m "feat(inbox): POST /api/gmail/classify — Claude email classification"
```

---

## Task 7: Suggestion Logic + Tests

**Files:**
- Create: `dashboard/src/lib/gmail/suggestions.ts`
- Create: `dashboard/src/__tests__/lib/gmail/suggestions.test.ts`

- [ ] **Step 1: Write suggestion logic tests**

Create `dashboard/src/__tests__/lib/gmail/suggestions.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { extractSecondLevelDomain, findDomainMatch } from "@/lib/gmail/suggestions"

describe("extractSecondLevelDomain", () => {
  it("extracts SLD from standard domain", () => {
    expect(extractSecondLevelDomain("cummins.com")).toBe("cummins")
  })

  it("handles subdomains", () => {
    expect(extractSecondLevelDomain("mail.cummins.com")).toBe("cummins")
  })

  it("returns null for null input", () => {
    expect(extractSecondLevelDomain(null)).toBeNull()
  })
})

describe("findDomainMatch", () => {
  const applications = [
    { id: "app-1", company: "Cummins Inc.", status: "applied" },
    { id: "app-2", company: "Eli Lilly and Company", status: "interested" },
    { id: "app-3", company: "TekSystems", status: "applied" },
  ]

  it("matches domain to single application", () => {
    expect(findDomainMatch("cummins.com", applications)).toBe("app-1")
  })

  it("returns null for no match", () => {
    expect(findDomainMatch("google.com", applications)).toBeNull()
  })

  it("returns null for multiple matches (ambiguous)", () => {
    const dupes = [
      { id: "app-1", company: "Cummins Engines", status: "applied" },
      { id: "app-2", company: "Cummins Power", status: "interview" },
    ]
    expect(findDomainMatch("cummins.com", dupes)).toBeNull()
  })

  it("handles staffing agency domains (no match expected)", () => {
    expect(findDomainMatch("teksystems.com", applications)).toBe("app-3")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd dashboard && npx vitest run src/__tests__/lib/gmail/suggestions.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement suggestion logic**

Create `dashboard/src/lib/gmail/suggestions.ts`:

```typescript
export function extractSecondLevelDomain(domain: string | null): string | null {
  if (!domain) return null
  const parts = domain.split(".")
  // For "mail.cummins.com" → ["mail", "cummins", "com"] → "cummins"
  // For "cummins.com" → ["cummins", "com"] → "cummins"
  return parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : null
}

interface AppForMatch {
  id: string
  company: string
  status: string
}

export function findDomainMatch(
  fromDomain: string,
  applications: AppForMatch[]
): string | null {
  const sld = extractSecondLevelDomain(fromDomain)
  if (!sld) return null

  const matches = applications.filter((app) =>
    app.company.toLowerCase().includes(sld)
  )

  // Only suggest if exactly one match (no ambiguity)
  return matches.length === 1 ? matches[0].id : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && npx vitest run src/__tests__/lib/gmail/suggestions.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/gmail/suggestions.ts dashboard/src/__tests__/lib/gmail/suggestions.test.ts
git commit -m "feat(inbox): domain-matching suggestion logic with tests"
```

---

## Task 8: useEmails Hook

**Files:**
- Create: `dashboard/src/hooks/use-emails.ts`

This is the core orchestration hook. It handles: loading cached emails from Supabase, scan-on-load with 15-minute cooldown, orphan recovery, classification pipeline, suggestion computation, and link/dismiss operations.

- [ ] **Step 1: Create the hook**

Create `dashboard/src/hooks/use-emails.ts`:

```typescript
"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { extractDomain, extractPreview } from "@/lib/gmail/parse"
import { findDomainMatch } from "@/lib/gmail/suggestions"
import type { Email, EmailApplicationLink, ClassificationResult, Application } from "@/types"

const supabase = createClient()
const SCAN_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 1000
const MAX_CLASSIFY_ATTEMPTS = 3

interface ScanState {
  scanning: boolean
  classifying: boolean
  classified: number
  total: number
  lastScan: string | null
}

export function useEmails() {
  const [emails, setEmails] = useState<Email[]>([])
  const [links, setLinks] = useState<EmailApplicationLink[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [scanState, setScanState] = useState<ScanState>({
    scanning: false,
    classifying: false,
    classified: 0,
    total: 0,
    lastScan: null,
  })
  const classifyAttemptsRef = useRef<Record<string, number>>({})

  // ── Load cached data on mount ──────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const [emailsRes, linksRes, appsRes, settingsRes] = await Promise.all([
        supabase.from("emails").select("*").eq("user_id", user.id).order("received_at", { ascending: false }),
        supabase.from("email_application_links").select("*").eq("user_id", user.id),
        supabase.from("applications").select("id, company, status").eq("user_id", user.id),
        supabase.from("user_settings").select("last_email_scan").eq("user_id", user.id).single(),
      ])

      setEmails(emailsRes.data || [])
      setLinks(linksRes.data || [])
      setApplications(appsRes.data || [])
      setScanState((prev) => ({
        ...prev,
        lastScan: settingsRes.data?.last_email_scan || null,
      }))
      setLoading(false)
    }
    load()
  }, [])

  // ── Scan-on-load trigger ───────────────────────────────────────
  useEffect(() => {
    if (loading) return
    autoScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const autoScan = useCallback(async () => {
    // Check for orphaned unclassified emails first
    const orphans = emails.filter((e) => e.category === "unclassified")
    if (orphans.length > 0) {
      await classifyEmails(orphans)
      return
    }

    // Cooldown check
    if (scanState.lastScan) {
      const elapsed = Date.now() - new Date(scanState.lastScan).getTime()
      if (elapsed < SCAN_COOLDOWN_MS) return
    }

    await runScan()
  }, [emails, scanState.lastScan])

  // ── Scan Gmail for new emails ──────────────────────────────────
  const runScan = useCallback(async (forceSince?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setScanState((prev) => ({ ...prev, scanning: true }))

    const since = forceSince || scanState.lastScan || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    let pageToken: string | null = null
    const allNewEmails: Email[] = []

    try {
      // Paginated fetch
      do {
        const resp = await fetch("/api/gmail/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ since, page_token: pageToken }),
        })
        const data = await resp.json()

        if (data.error && !data.emails?.length) break

        // Dedup against existing emails
        const existingGmailIds = new Set(emails.map((e) => e.gmail_id))
        const newMetadata = (data.emails || []).filter(
          (e: { gmail_id: string }) => !existingGmailIds.has(e.gmail_id)
        )

        // Insert unclassified rows into Supabase
        if (newMetadata.length > 0) {
          const rows = newMetadata.map((e: any) => ({
            user_id: user.id,
            gmail_id: e.gmail_id,
            thread_id: e.thread_id,
            from_email: e.from_email,
            from_name: e.from_name,
            from_domain: e.from_domain || extractDomain(e.from_email),
            to_email: e.to_email,
            subject: e.subject,
            received_at: e.received_at,
            category: "unclassified",
          }))

          const { data: inserted } = await supabase
            .from("emails")
            .upsert(rows, { onConflict: "user_id,gmail_id", ignoreDuplicates: true })
            .select()

          if (inserted) {
            allNewEmails.push(...inserted)
            setEmails((prev) => [...inserted, ...prev])
          }
        }

        pageToken = data.next_page_token
      } while (pageToken)

      // Update scan timestamp
      await supabase.from("user_settings").upsert(
        { user_id: user.id, last_email_scan: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      setScanState((prev) => ({ ...prev, scanning: false, lastScan: new Date().toISOString() }))

      // Classify new emails
      if (allNewEmails.length > 0) {
        await classifyEmails(allNewEmails)
      }
    } catch (error) {
      console.error("Scan error:", error)
      setScanState((prev) => ({ ...prev, scanning: false }))
    }
  }, [emails, scanState.lastScan])

  // ── Classify emails in batches ─────────────────────────────────
  const classifyEmails = useCallback(async (toClassify: Email[]) => {
    setScanState((prev) => ({
      ...prev,
      classifying: true,
      classified: 0,
      total: toClassify.length,
    }))

    for (let i = 0; i < toClassify.length; i++) {
      const email = toClassify[i]

      // Check retry limit
      const attempts = classifyAttemptsRef.current[email.gmail_id] || 0
      if (attempts >= MAX_CLASSIFY_ATTEMPTS) {
        // Auto-mark as irrelevant after max attempts
        await supabase.from("emails").update({
          category: "irrelevant",
          classification_json: { category: "irrelevant", company: null, role: null, urgency: "low", summary: "Classification failed after multiple attempts" },
          dismissed: true,
        }).eq("id", email.id)
        setEmails((prev) => prev.map((e) =>
          e.id === email.id ? { ...e, category: "irrelevant", dismissed: true } : e
        ))
        setScanState((prev) => ({ ...prev, classified: prev.classified + 1 }))
        continue
      }
      classifyAttemptsRef.current[email.gmail_id] = attempts + 1

      try {
        // Fetch full body
        const bodyResp = await fetch("/api/gmail/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail_id: email.gmail_id }),
        })
        const { body } = await bodyResp.json()

        const bodyPreview = (body || "").slice(0, 500)

        // Classify
        const classifyResp = await fetch("/api/gmail/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from_email: email.from_email,
            from_name: email.from_name,
            subject: email.subject,
            received_at: email.received_at,
            body: body || "",
          }),
        })
        const classification: ClassificationResult = await classifyResp.json()

        // Compute suggestion
        const suggestedAppId = await computeSuggestion(email, applications)

        // Update Supabase
        const updates: Record<string, any> = {
          category: classification.category,
          classification_json: classification,
          body_preview: bodyPreview,
          suggested_application_id: suggestedAppId,
        }
        if (classification.category === "irrelevant") {
          updates.dismissed = true
        }

        await supabase.from("emails").update(updates).eq("id", email.id)

        // Update local state
        setEmails((prev) => prev.map((e) =>
          e.id === email.id
            ? { ...e, ...updates }
            : e
        ))
      } catch (error) {
        console.error(`Failed to classify email ${email.gmail_id}:`, error)
        // body_preview still saved if body fetch succeeded
      }

      setScanState((prev) => ({ ...prev, classified: prev.classified + 1 }))

      // Batch delay
      if ((i + 1) % BATCH_SIZE === 0 && i + 1 < toClassify.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    setScanState((prev) => ({ ...prev, classifying: false }))
  }, [applications])

  // ── Suggestion computation ─────────────────────────────────────
  const computeSuggestion = async (
    email: Email,
    apps: Pick<Application, "id" | "company" | "status">[]
  ): Promise<string | null> => {
    // Priority 1: thread siblings
    if (email.thread_id) {
      const { data: siblings } = await supabase
        .from("email_application_links")
        .select("application_id, email_id")
        .in(
          "email_id",
          emails
            .filter((e) => e.thread_id === email.thread_id && e.id !== email.id)
            .map((e) => e.id)
        )

      if (siblings && siblings.length > 0) {
        return siblings[0].application_id
      }
    }

    // Priority 2: domain matching
    return findDomainMatch(email.from_domain || "", apps)
  }

  // ── Link / Unlink / Dismiss ────────────────────────────────────
  const linkEmail = useCallback(async (
    emailId: string,
    applicationId: string,
    linkedBy: "manual" | "confirmed_suggestion" = "manual"
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from("email_application_links")
      .insert({ email_id: emailId, application_id: applicationId, user_id: user.id, linked_by: linkedBy })
      .select()
      .single()

    if (data) {
      setLinks((prev) => [...prev, data])
    }
  }, [])

  const unlinkEmail = useCallback(async (emailId: string, applicationId: string) => {
    await supabase
      .from("email_application_links")
      .delete()
      .eq("email_id", emailId)
      .eq("application_id", applicationId)

    setLinks((prev) =>
      prev.filter((l) => !(l.email_id === emailId && l.application_id === applicationId))
    )
  }, [])

  const dismissEmail = useCallback(async (emailId: string) => {
    await supabase.from("emails").update({ dismissed: true }).eq("id", emailId)
    setEmails((prev) => prev.map((e) =>
      e.id === emailId ? { ...e, dismissed: true } : e
    ))
  }, [])

  const undismissEmail = useCallback(async (emailId: string) => {
    await supabase.from("emails").update({ dismissed: false }).eq("id", emailId)
    setEmails((prev) => prev.map((e) =>
      e.id === emailId ? { ...e, dismissed: false } : e
    ))
  }, [])

  const dismissMany = useCallback(async (emailIds: string[]) => {
    await supabase.from("emails").update({ dismissed: true }).in("id", emailIds)
    setEmails((prev) => prev.map((e) =>
      emailIds.includes(e.id) ? { ...e, dismissed: true } : e
    ))
  }, [])

  const linkMany = useCallback(async (emailIds: string[], applicationId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rows = emailIds.map((emailId) => ({
      email_id: emailId,
      application_id: applicationId,
      user_id: user.id,
      linked_by: "manual" as const,
    }))

    const { data } = await supabase.from("email_application_links").insert(rows).select()
    if (data) {
      setLinks((prev) => [...prev, ...data])
    }
  }, [])

  const markRead = useCallback(async (emailId: string) => {
    await supabase.from("emails").update({ is_read: true }).eq("id", emailId)
    setEmails((prev) => prev.map((e) =>
      e.id === emailId ? { ...e, is_read: true } : e
    ))
  }, [])

  // ── Manual refresh ─────────────────────────────────────────────
  const refresh = useCallback(() => runScan(), [runScan])

  return {
    emails,
    links,
    applications,
    loading,
    scanState,
    linkEmail,
    unlinkEmail,
    dismissEmail,
    undismissEmail,
    dismissMany,
    linkMany,
    markRead,
    refresh,
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd dashboard && npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/hooks/use-emails.ts
git commit -m "feat(inbox): useEmails hook — scan-on-load, classification pipeline, linking"
```

---

## Task 9: Category Badge + Filter Chips Components

**Files:**
- Create: `dashboard/src/components/inbox/category-badge.tsx`
- Create: `dashboard/src/components/inbox/filter-chips.tsx`

- [ ] **Step 1: Create category badge component**

Create `dashboard/src/components/inbox/category-badge.tsx`:

```tsx
"use client"

import type { EmailCategory } from "@/types/email"

const CATEGORY_STYLES: Record<EmailCategory, { bg: string; text: string; label: string }> = {
  recruiter_outreach: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", label: "Recruiter" },
  interview_request: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", label: "Interview" },
  follow_up: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", label: "Follow-up" },
  offer: { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", label: "Offer" },
  job_alert: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400", label: "Alert" },
  rejection: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-600 dark:text-red-400", label: "Rejected" },
  irrelevant: { bg: "bg-zinc-50 dark:bg-zinc-800/50", text: "text-zinc-400 dark:text-zinc-500", label: "Irrelevant" },
  unclassified: { bg: "bg-zinc-100 dark:bg-zinc-800 animate-pulse", text: "text-zinc-400", label: "..." },
}

export function CategoryBadge({ category }: { category: EmailCategory }) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.irrelevant
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}
```

- [ ] **Step 2: Create filter chips component**

Create `dashboard/src/components/inbox/filter-chips.tsx`:

```tsx
"use client"

import type { Email, EmailApplicationLink, EmailCategory } from "@/types"

interface FilterChipsProps {
  emails: Email[]
  links: EmailApplicationLink[]
  activeFilter: string
  onFilter: (filter: string) => void
  showDismissed: boolean
}

const FILTERS: { id: string; label: string; categories?: EmailCategory[] }[] = [
  { id: "all", label: "All" },
  { id: "recruiter", label: "Recruiter", categories: ["recruiter_outreach"] },
  { id: "interview", label: "Interview", categories: ["interview_request"] },
  { id: "follow_up", label: "Follow-up", categories: ["follow_up"] },
  { id: "offers", label: "Offers", categories: ["offer"] },
  { id: "alerts", label: "Alerts", categories: ["job_alert"] },
  { id: "rejected", label: "Rejected", categories: ["rejection"] },
  { id: "unlinked", label: "Unlinked" },
]

export function FilterChips({ emails, links, activeFilter, onFilter, showDismissed }: FilterChipsProps) {
  const visible = showDismissed ? emails : emails.filter((e) => !e.dismissed)
  const linkedEmailIds = new Set(links.map((l) => l.email_id))

  function getCount(filter: (typeof FILTERS)[number]): number {
    if (filter.id === "all") return visible.length
    if (filter.id === "unlinked") return visible.filter((e) => !linkedEmailIds.has(e.id)).length
    if (filter.categories) return visible.filter((e) => filter.categories!.includes(e.category)).length
    return 0
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map((filter) => {
        const count = getCount(filter)
        const active = activeFilter === filter.id
        return (
          <button
            key={filter.id}
            onClick={() => onFilter(filter.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              active
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                : count === 0
                ? "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-600 border border-transparent"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
            }`}
          >
            {filter.label}
            <span className={`ml-1 ${count === 0 && !active ? "opacity-50" : ""}`}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/inbox/category-badge.tsx dashboard/src/components/inbox/filter-chips.tsx
git commit -m "feat(inbox): category badge + filter chips with counts"
```

---

## Task 10: Email Card + Email List Components

**Files:**
- Create: `dashboard/src/components/inbox/email-card.tsx`
- Create: `dashboard/src/components/inbox/email-list.tsx`
- Create: `dashboard/src/components/inbox/bulk-actions.tsx`

- [ ] **Step 1: Create email card component**

Create `dashboard/src/components/inbox/email-card.tsx`:

```tsx
"use client"

import { formatDistanceToNow } from "date-fns"
import { CategoryBadge } from "./category-badge"
import type { Email, EmailApplicationLink, Application } from "@/types"

interface EmailCardProps {
  email: Email
  isSelected: boolean
  isChecked: boolean
  onSelect: () => void
  onCheck: (checked: boolean) => void
  linkedApp: Application | null
  hasSuggestion: boolean
}

export function EmailCard({
  email, isSelected, isChecked, onSelect, onCheck, linkedApp, hasSuggestion,
}: EmailCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-start gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 cursor-pointer transition-all ${
        isSelected
          ? "bg-amber-50 dark:bg-amber-900/10 border-l-2 border-l-amber-500"
          : hasSuggestion && !linkedApp
          ? "border-l-2 border-l-dashed border-l-blue-400/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          : "border-l-2 border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      } ${!email.is_read ? "font-medium" : ""}`}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => { e.stopPropagation(); onCheck(e.target.checked) }}
        className="mt-1 rounded border-zinc-300 dark:border-zinc-600 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-sm truncate text-zinc-900 dark:text-zinc-100">
            {email.from_name || email.from_email}
          </span>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0 font-mono">
            {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
          </span>
        </div>
        <div className="text-sm truncate text-zinc-700 dark:text-zinc-300 mb-1">
          {email.subject || "(no subject)"}
        </div>
        <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate mb-1.5">
          {email.body_preview?.slice(0, 100) || ""}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryBadge category={email.category} />
          {linkedApp && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              {linkedApp.title} @ {linkedApp.company}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create bulk actions bar**

Create `dashboard/src/components/inbox/bulk-actions.tsx`:

```tsx
"use client"

import type { Application } from "@/types"

interface BulkActionsProps {
  selectedCount: number
  applications: Pick<Application, "id" | "company" | "title">[]
  onDismiss: () => void
  onLink: (applicationId: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

export function BulkActions({
  selectedCount, applications, onDismiss, onLink, onSelectAll, onDeselectAll,
}: BulkActionsProps) {
  if (selectedCount === 0) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800">
      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
        {selectedCount} selected
      </span>
      <button
        onClick={onDismiss}
        className="text-xs px-2.5 py-1 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
      >
        Dismiss selected
      </button>
      <select
        onChange={(e) => { if (e.target.value) onLink(e.target.value); e.target.value = "" }}
        defaultValue=""
        className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
      >
        <option value="">Link to...</option>
        {applications.map((app) => (
          <option key={app.id} value={app.id}>
            {app.title} @ {app.company}
          </option>
        ))}
      </select>
      <div className="ml-auto flex gap-2">
        <button onClick={onSelectAll} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Select all</button>
        <button onClick={onDeselectAll} className="text-xs text-zinc-500 hover:underline">Deselect</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create email list component**

Create `dashboard/src/components/inbox/email-list.tsx`:

```tsx
"use client"

import { useMemo } from "react"
import { EmailCard } from "./email-card"
import { BulkActions } from "./bulk-actions"
import type { Email, EmailApplicationLink, Application, EmailCategory } from "@/types"

interface EmailListProps {
  emails: Email[]
  links: EmailApplicationLink[]
  applications: Pick<Application, "id" | "company" | "title" | "status">[]
  selectedEmailId: string | null
  checkedIds: Set<string>
  filter: string
  showDismissed: boolean
  onSelect: (id: string) => void
  onCheck: (id: string, checked: boolean) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onDismissMany: (ids: string[]) => void
  onLinkMany: (ids: string[], appId: string) => void
}

const FILTER_CATEGORIES: Record<string, EmailCategory[]> = {
  recruiter: ["recruiter_outreach"],
  interview: ["interview_request"],
  follow_up: ["follow_up"],
  offers: ["offer"],
  alerts: ["job_alert"],
  rejected: ["rejection"],
}

export function EmailList({
  emails, links, applications, selectedEmailId, checkedIds, filter, showDismissed,
  onSelect, onCheck, onSelectAll, onDeselectAll, onDismissMany, onLinkMany,
}: EmailListProps) {
  const linkedEmailIds = useMemo(() => {
    const map = new Map<string, string>()
    links.forEach((l) => map.set(l.email_id, l.application_id))
    return map
  }, [links])

  const appMap = useMemo(() => {
    const map = new Map<string, (typeof applications)[number]>()
    applications.forEach((a) => map.set(a.id, a))
    return map
  }, [applications])

  const filtered = useMemo(() => {
    let list = showDismissed ? emails : emails.filter((e) => !e.dismissed)

    if (filter === "unlinked") {
      list = list.filter((e) => !linkedEmailIds.has(e.id))
    } else if (FILTER_CATEGORIES[filter]) {
      list = list.filter((e) => FILTER_CATEGORIES[filter].includes(e.category))
    }

    return list
  }, [emails, filter, showDismissed, linkedEmailIds])

  return (
    <div className="flex flex-col h-full">
      <BulkActions
        selectedCount={checkedIds.size}
        applications={applications}
        onDismiss={() => onDismissMany(Array.from(checkedIds))}
        onLink={(appId) => onLinkMany(Array.from(checkedIds), appId)}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
      />
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500 py-12">
            <span className="text-3xl mb-2">All caught up</span>
            <span className="text-sm">No emails match this filter</span>
          </div>
        ) : (
          filtered.map((email) => {
            const linkedAppId = linkedEmailIds.get(email.id)
            const linkedApp = linkedAppId ? appMap.get(linkedAppId) || null : null
            return (
              <EmailCard
                key={email.id}
                email={email}
                isSelected={selectedEmailId === email.id}
                isChecked={checkedIds.has(email.id)}
                onSelect={() => onSelect(email.id)}
                onCheck={(checked) => onCheck(email.id, checked)}
                linkedApp={linkedApp as Application | null}
                hasSuggestion={!!email.suggested_application_id}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/inbox/email-card.tsx dashboard/src/components/inbox/email-list.tsx dashboard/src/components/inbox/bulk-actions.tsx
git commit -m "feat(inbox): email card, email list, and bulk actions components"
```

---

## Task 11: Email Detail Panel

**Files:**
- Create: `dashboard/src/components/inbox/email-detail.tsx`

- [ ] **Step 1: Create the detail panel**

Create `dashboard/src/components/inbox/email-detail.tsx`:

```tsx
"use client"

import { format, formatDistanceToNow } from "date-fns"
import { ExternalLink } from "lucide-react"
import { CategoryBadge } from "./category-badge"
import type { Email, EmailApplicationLink, Application } from "@/types"

interface EmailDetailProps {
  email: Email
  links: EmailApplicationLink[]
  applications: Pick<Application, "id" | "company" | "title" | "status">[]
  onLink: (emailId: string, appId: string, linkedBy: "manual" | "confirmed_suggestion") => void
  onUnlink: (emailId: string, appId: string) => void
  onDismiss: (emailId: string) => void
  onUndismiss: (emailId: string) => void
}

export function EmailDetail({
  email, links, applications, onLink, onUnlink, onDismiss, onUndismiss,
}: EmailDetailProps) {
  const emailLinks = links.filter((l) => l.email_id === email.id)
  const linkedAppIds = new Set(emailLinks.map((l) => l.application_id))
  const classification = email.classification_json
  const suggestion = email.suggested_application_id
  const suggestedApp = suggestion ? applications.find((a) => a.id === suggestion) : null

  const handleLink = (appId: string) => {
    const linkedBy = appId === suggestion ? "confirmed_suggestion" : "manual"
    onLink(email.id, appId, linkedBy as "manual" | "confirmed_suggestion")
  }

  const gmailUrl = email.thread_id
    ? `https://mail.google.com/mail/u/0/#inbox/${email.thread_id}`
    : `https://mail.google.com/mail/u/0/#inbox/${email.gmail_id}`

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
              {email.from_name && <span className="font-medium text-zinc-700 dark:text-zinc-300">{email.from_name}</span>}
              {" "}<span className="font-mono text-xs">&lt;{email.from_email}&gt;</span>
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
              {email.subject || "(no subject)"}
            </h3>
          </div>
          <CategoryBadge category={email.category} />
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
          <span>{format(new Date(email.received_at), "MMM d, yyyy h:mm a")}</span>
          <span>({formatDistanceToNow(new Date(email.received_at), { addSuffix: true })})</span>
        </div>
        {classification && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {classification.company && (
              <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {classification.company}
              </span>
            )}
            {classification.role && (
              <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {classification.role}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded ${
              classification.urgency === "high" ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
              classification.urgency === "medium" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
              "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            }`}>
              {classification.urgency} urgency
            </span>
          </div>
        )}
        {classification?.summary && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 italic">
            {classification.summary}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
          {email.body_preview || "No preview available."}
        </pre>
      </div>

      {/* Linking Section */}
      <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
        {/* Linked applications */}
        {emailLinks.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Linked to:</span>
            {emailLinks.map((link) => {
              const app = applications.find((a) => a.id === link.application_id)
              return app ? (
                <div key={link.application_id} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 rounded px-2.5 py-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {app.title} @ {app.company}
                  </span>
                  <button onClick={() => onUnlink(email.id, link.application_id)} className="text-[10px] text-red-500 hover:underline">
                    Unlink
                  </button>
                </div>
              ) : null
            })}
          </div>
        )}

        {/* Suggestion or dropdown */}
        {emailLinks.length === 0 && (
          <div className="flex items-center gap-2">
            <select
              defaultValue={suggestion || ""}
              onChange={(e) => { if (e.target.value) handleLink(e.target.value) }}
              className="flex-1 text-sm px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">Link to application...</option>
              {applications
                .filter((a) => !linkedAppIds.has(a.id))
                .map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.title} @ {app.company}
                  </option>
                ))}
            </select>
            {suggestedApp && (
              <span className="text-[10px] text-blue-500 dark:text-blue-400 flex-shrink-0">
                Suggested
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {email.dismissed ? (
            <button onClick={() => onUndismiss(email.id)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              Restore to inbox
            </button>
          ) : (
            <button onClick={() => onDismiss(email.id)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              Dismiss
            </button>
          )}
          <a
            href={gmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400"
          >
            Open in Gmail <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/inbox/email-detail.tsx
git commit -m "feat(inbox): email detail panel with linking, dismiss, and Gmail link"
```

---

## Task 12: Inbox Page + Sidebar Nav Update

**Files:**
- Modify: `dashboard/src/components/layout/sidebar.tsx` (line 6, line 12)
- Create: `dashboard/src/app/(main)/inbox/page.tsx`

- [ ] **Step 1: Add Inbox to sidebar nav**

In `dashboard/src/components/layout/sidebar.tsx`:

Add `Mail` to the lucide-react import (line 6):
```typescript
import { LayoutDashboard, Search, Briefcase, BarChart3, ChevronRight, Mail } from "lucide-react"
```

Add Inbox item to NAV_ITEMS array as the second item (after Overview, before Job Search) — Inbox is a high-frequency feature that should be prominent:
```typescript
  { id: "inbox", href: "/inbox", label: "Inbox", icon: Mail },
```

- [ ] **Step 2: Create the inbox page**

Create `dashboard/src/app/(main)/inbox/page.tsx`:

```tsx
"use client"

import { useState, useCallback, useMemo } from "react"
import { RefreshCw } from "lucide-react"
import { useEmails } from "@/hooks/use-emails"
import { FilterChips } from "@/components/inbox/filter-chips"
import { EmailList } from "@/components/inbox/email-list"
import { EmailDetail } from "@/components/inbox/email-detail"

export default function InboxPage() {
  const {
    emails, links, applications, loading, scanState,
    linkEmail, unlinkEmail, dismissEmail, undismissEmail, dismissMany, linkMany, markRead, refresh,
  } = useEmails()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("all")
  const [showDismissed, setShowDismissed] = useState(false)

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedId) || null,
    [emails, selectedId]
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    markRead(id)
  }, [markRead])

  const handleCheck = useCallback((id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    const visible = showDismissed ? emails : emails.filter((e) => !e.dismissed)
    setCheckedIds(new Set(visible.map((e) => e.id)))
  }, [emails, showDismissed])

  const handleDeselectAll = useCallback(() => setCheckedIds(new Set()), [])

  const handleDismissMany = useCallback((ids: string[]) => {
    dismissMany(ids)
    setCheckedIds(new Set())
  }, [dismissMany])

  const handleLinkMany = useCallback((ids: string[], appId: string) => {
    linkMany(ids, appId)
    setCheckedIds(new Set())
  }, [linkMany])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        <div className="animate-spin w-5 h-5 border-2 border-zinc-300 border-t-amber-500 rounded-full mr-3" />
        Loading inbox...
      </div>
    )
  }

  const statusText = scanState.classifying
    ? `Classifying ${scanState.classified} of ${scanState.total} emails...`
    : scanState.scanning
    ? "Scanning Gmail..."
    : scanState.lastScan
    ? `Last scanned ${new Date(scanState.lastScan).toLocaleTimeString()}`
    : "Not yet scanned"

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Inbox</h1>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono flex items-center gap-2">
              {(scanState.scanning || scanState.classifying) && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
              {statusText}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={(e) => setShowDismissed(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              Show dismissed
            </label>
            <button
              onClick={refresh}
              disabled={scanState.scanning || scanState.classifying}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} className={scanState.scanning ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
        <FilterChips
          emails={emails}
          links={links}
          activeFilter={filter}
          onFilter={setFilter}
          showDismissed={showDismissed}
        />
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: email list */}
        <div className="w-[420px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <EmailList
            emails={emails}
            links={links}
            applications={applications}
            selectedEmailId={selectedId}
            checkedIds={checkedIds}
            filter={filter}
            showDismissed={showDismissed}
            onSelect={handleSelect}
            onCheck={handleCheck}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onDismissMany={handleDismissMany}
            onLinkMany={handleLinkMany}
          />
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 overflow-hidden">
          {selectedEmail ? (
            <EmailDetail
              email={selectedEmail}
              links={links}
              applications={applications}
              onLink={linkEmail}
              onUnlink={unlinkEmail}
              onDismiss={dismissEmail}
              onUndismiss={undismissEmail}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500">
              <span className="text-3xl mb-2">Select an email</span>
              <span className="text-sm">Click an email to view details and link to applications</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the app compiles**

```bash
cd dashboard && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/layout/sidebar.tsx dashboard/src/app/\(main\)/inbox/page.tsx
git commit -m "feat(inbox): Inbox page with two-panel layout + sidebar nav entry"
```

---

## Task 13: Run Full Test Suite + Verify Build

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
cd dashboard && npx vitest run
```

Expected: all tests pass, including new parse and suggestions tests.

- [ ] **Step 2: Run build**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Start dev server and verify Inbox page loads**

```bash
cd dashboard && npm run dev
```

Navigate to `http://localhost:3000/inbox`. Verify:
- Inbox tab appears in sidebar nav
- Page loads with "Not yet scanned" status
- If Gmail token is not configured, page shows loading state then empty inbox
- Filter chips render with zero counts
- No console errors

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A && git commit -m "fix(inbox): address build/test issues from integration"
```

---

## Task 14: Generate Gmail Refresh Token

**Files:** None (manual setup)

This task sets up the Gmail OAuth refresh token needed for the scan routes to work.

- [ ] **Step 1: Generate refresh token with gmail.readonly scope**

Use the existing Google Cloud project credentials. Run a local script or use the OAuth Playground to generate a refresh token with scope `https://www.googleapis.com/auth/gmail.readonly`.

If a `GOOGLE_REFRESH_TOKEN` already exists in Vercel env vars (for calendar), check if it includes the gmail.readonly scope. If not, regenerate with both scopes:
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/gmail.readonly`

- [ ] **Step 2: Add to Vercel env vars**

Either update `GOOGLE_REFRESH_TOKEN` with the new multi-scope token, or add a separate `GMAIL_REFRESH_TOKEN` env var.

Also ensure these exist:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

- [ ] **Step 3: Test the scan route manually**

```bash
curl -X POST http://localhost:3000/api/gmail/scan \
  -H "Content-Type: application/json" \
  -d '{"since": "2026-03-18T00:00:00Z"}' \
  -b "<supabase-auth-cookie>"
```

Expected: JSON response with `emails` array and `next_page_token`.

- [ ] **Step 4: Push to Vercel and verify**

```bash
git push origin master
```

Verify the deployed Inbox page can scan Gmail.
