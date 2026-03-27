# SCRUM-190: Quick Apply + Assisted Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Quick Apply flow that walks users through a pre-apply checklist (resume tailored? cover letter generated?), opens the external job URL, then confirms application tracking in Supabase.

**Architecture:** New `apply-flow.tsx` dialog component with two states: checklist view and confirmation view. Wired into both `JobCard` (via new `onApply` prop) and `JobDetailPane` (replaces "View Original" button). The search page orchestrates state and delegates tracking to the existing `useApplications` hook, which already auto-sets `date_applied` on status="applied".

**Tech Stack:** React, base-ui Dialog, sonner toast, Supabase (existing), lucide-react icons

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `dashboard/src/components/search/apply-flow.tsx` | ApplyFlow dialog: checklist + confirmation states |
| Modify | `dashboard/src/components/shared/job-card.tsx` | Add Apply button (tracked + untracked) |
| Modify | `dashboard/src/components/search/job-detail-pane.tsx` | Replace "View Original" with "Apply" button that opens ApplyFlow |
| Modify | `dashboard/src/app/(main)/search/page.tsx` | Wire ApplyFlow state, pass `onApply` to JobCard and DetailPane |
| Create | `dashboard/supabase/migrations/010_add_cover_letter_and_events.sql` | Add `cover_letter` column + `application_events` table |

---

### Task 1: Supabase Migration — `cover_letter` Column + `application_events` Table

**Files:**
- Create: `dashboard/supabase/migrations/010_add_cover_letter_and_events.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 010_add_cover_letter_and_events.sql
-- Adds cover_letter column to applications and creates application_events table

-- cover_letter column (TS type already references it, but no migration created it)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter TEXT;

-- contact fields (referenced in TS type, ensure they exist)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_role TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS job_description TEXT;

-- application_events table (referenced by use-application-events.ts and use-applications.ts)
CREATE TABLE IF NOT EXISTS application_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON application_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON application_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run the migration through Supabase MCP `apply_migration` tool with the SQL above, or confirm it's queued for next deploy.

- [ ] **Step 3: Commit**

```bash
git add dashboard/supabase/migrations/010_add_cover_letter_and_events.sql
git commit -m "feat: SCRUM-190 add cover_letter column and application_events table"
```

---

### Task 2: Create ApplyFlow Dialog Component

**Files:**
- Create: `dashboard/src/components/search/apply-flow.tsx`

This is the core new component. Two states: "checklist" (pre-apply) and "confirm" (post-open-URL).

- [ ] **Step 1: Create `apply-flow.tsx` with full implementation**

```tsx
"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  FileText,
  Zap,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react"
import type { Job } from "@/types"

type ApplyFlowView = "checklist" | "confirm"

interface ApplyFlowProps {
  job: Job
  isOpen: boolean
  onClose: () => void
  onApplied: (job: Job) => void
  /** Pre-generated tailored resume text (from in-memory ref or saved application) */
  tailoredResume: string | null
  /** Pre-generated cover letter text (from in-memory ref or saved application) */
  coverLetter: string | null
  /** Callback to open the tailor modal for this job */
  onTailor?: (job: Job) => void
  /** Callback to open the cover letter modal for this job */
  onCoverLetter?: (job: Job) => void
}

export function ApplyFlow({
  job,
  isOpen,
  onClose,
  onApplied,
  tailoredResume,
  coverLetter,
  onTailor,
  onCoverLetter,
}: ApplyFlowProps) {
  const [view, setView] = useState<ApplyFlowView>("checklist")
  const [resumeCopied, setResumeCopied] = useState(false)
  const [letterCopied, setLetterCopied] = useState(false)

  const hasResume = !!tailoredResume
  const hasCoverLetter = !!coverLetter

  const applyUrl = job.url

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset state on close
      setView("checklist")
      setResumeCopied(false)
      setLetterCopied(false)
      onClose()
    }
  }

  async function handleCopyResume() {
    if (!tailoredResume) return
    try {
      await navigator.clipboard.writeText(tailoredResume)
      setResumeCopied(true)
      toast.success("Resume copied to clipboard")
      setTimeout(() => setResumeCopied(false), 2000)
    } catch {
      toast.error("Failed to copy — try manually selecting the text")
    }
  }

  async function handleCopyCoverLetter() {
    if (!coverLetter) return
    try {
      await navigator.clipboard.writeText(coverLetter)
      setLetterCopied(true)
      toast.success("Cover letter copied to clipboard")
      setTimeout(() => setLetterCopied(false), 2000)
    } catch {
      toast.error("Failed to copy — try manually selecting the text")
    }
  }

  function handleOpenApplication() {
    if (applyUrl) {
      window.open(applyUrl, "_blank", "noopener,noreferrer")
    }
    setView("confirm")
  }

  function handleConfirmApplied() {
    onApplied(job)
    toast.success(`Applied to ${job.title} at ${job.company}`)
    handleOpenChange(false)
  }

  function handleNotYet() {
    setView("checklist")
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {view === "checklist" ? (
          <>
            <DialogHeader>
              <DialogTitle>Apply to {job.title}</DialogTitle>
              <DialogDescription>at {job.company}</DialogDescription>
            </DialogHeader>

            {/* Pre-Apply Checklist */}
            <div className="space-y-4 py-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Pre-Apply Checklist
              </p>

              {/* Resume check */}
              <div className="flex items-start gap-3">
                {hasResume ? (
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-zinc-300 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-700">
                    Resume tailored for this role
                  </p>
                  <div className="flex gap-2 mt-1.5">
                    {hasResume ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyResume}
                        className="text-xs h-7"
                      >
                        {resumeCopied ? (
                          <Check className="size-3 mr-1" />
                        ) : (
                          <Copy className="size-3 mr-1" />
                        )}
                        {resumeCopied ? "Copied" : "Copy Resume"}
                      </Button>
                    ) : onTailor ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onClose()
                          onTailor(job)
                        }}
                        className="text-xs h-7"
                      >
                        <Sparkles className="size-3 mr-1" />
                        Tailor Resume
                      </Button>
                    ) : (
                      <span className="text-[10px] text-zinc-400 italic mt-1">
                        Coming soon
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cover letter check */}
              <div className="flex items-start gap-3">
                {hasCoverLetter ? (
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-zinc-300 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-700">
                    Cover letter generated
                  </p>
                  <div className="flex gap-2 mt-1.5">
                    {hasCoverLetter ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyCoverLetter}
                        className="text-xs h-7"
                      >
                        {letterCopied ? (
                          <Check className="size-3 mr-1" />
                        ) : (
                          <Copy className="size-3 mr-1" />
                        )}
                        {letterCopied ? "Copied" : "Copy Cover Letter"}
                      </Button>
                    ) : onCoverLetter ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onClose()
                          onCoverLetter(job)
                        }}
                        className="text-xs h-7"
                      >
                        <FileText className="size-3 mr-1" />
                        Generate Cover Letter
                      </Button>
                    ) : (
                      <span className="text-[10px] text-zinc-400 italic mt-1">
                        Coming soon
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Source + Easy Apply badge */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
                <span className="text-xs text-zinc-500">
                  Source: {job.source}
                </span>
                {job.easyApply && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                    <Zap size={10} />
                    Easy Apply available
                  </span>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleOpenApplication} disabled={!applyUrl}>
                <ExternalLink className="size-3.5 mr-1.5" />
                Open Application
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Confirmation view */
          <>
            <DialogHeader>
              <DialogTitle>Did you complete the application?</DialogTitle>
              <DialogDescription>
                {job.title} at {job.company}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div className="flex gap-2">
                <Button onClick={handleConfirmApplied} className="flex-1">
                  <Check className="size-3.5 mr-1.5" />
                  Yes, I applied
                </Button>
                <Button
                  variant="outline"
                  onClick={handleNotYet}
                  className="flex-1"
                >
                  Not yet
                </Button>
              </div>
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="w-full text-zinc-500"
              >
                <X className="size-3.5 mr-1.5" />
                Cancel — didn&apos;t apply
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify file created and no syntax errors**

Run: `cd dashboard && npx next lint src/components/search/apply-flow.tsx` or just check the build compiles.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/search/apply-flow.tsx
git commit -m "feat: SCRUM-190 create ApplyFlow dialog component"
```

---

### Task 3: Add Apply Button to JobCard

**Files:**
- Modify: `dashboard/src/components/shared/job-card.tsx`

The Apply button must be visible on BOTH tracked and untracked cards. For untracked cards, it sits alongside Track. For tracked cards, it appears next to the "Tracking" badge.

- [ ] **Step 1: Add `onApply` prop and `Send` icon import**

In `job-card.tsx`, add to the imports:

```tsx
import { Plus, Sparkles, FileText, Send } from "lucide-react"
```

Add to the `JobCardProps` interface:

```typescript
interface JobCardProps {
  job: Job
  onTrack: (job: Job) => void
  onApply?: (job: Job) => void
  onTailor?: (job: Job) => void
  onCoverLetter?: (job: Job) => void
  onTrackAndTailor?: (job: Job) => void
  onViewDetails?: (job: Job) => void
  tracked: boolean
  isNew?: boolean
}
```

Add `onApply` to the destructured props:

```typescript
export function JobCard({ job, onTrack, onApply, onTailor, onCoverLetter, onTrackAndTailor, onViewDetails, tracked, isNew }: JobCardProps) {
```

- [ ] **Step 2: Add Apply button to untracked card buttons**

In the `{!tracked ? (` block, after the Track button and before the Tailor button, add the Apply button:

```tsx
{job.url && onApply && (
  <button
    onClick={() => onApply(job)}
    className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
      job.easyApply
        ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
        : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
    }`}
    title="Start apply flow"
  >
    {job.easyApply ? <Zap size={10} /> : <Send size={10} />}
    Apply
  </button>
)}
```

Also add `Zap` to the lucide imports:

```tsx
import { Plus, Sparkles, FileText, Send, Zap } from "lucide-react"
```

- [ ] **Step 3: Add Apply button to tracked card section**

Replace the existing tracked `<span>` (the "Tracking" badge) with a fragment that includes both the badge AND an Apply button:

```tsx
) : (
  <div className="flex flex-col items-end gap-1.5">
    <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      Tracking
    </span>
    {job.url && onApply && (
      <button
        onClick={() => onApply(job)}
        className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
          job.easyApply
            ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
            : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
        }`}
        title="Start apply flow"
      >
        {job.easyApply ? <Zap size={10} /> : <Send size={10} />}
        Apply
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Verify no existing functionality removed**

Read the full modified file and confirm:
- Track button still exists for untracked cards
- Tailor, Cover Letter, Track+Tailor buttons still exist for untracked cards
- "Tracking" badge still shows for tracked cards
- All `onClick` handlers unchanged
- `e.stopPropagation()` wrapper div unchanged

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/shared/job-card.tsx
git commit -m "feat: SCRUM-190 add Apply button to JobCard (tracked + untracked)"
```

---

### Task 4: Add Apply Button to Job Detail Pane

**Files:**
- Modify: `dashboard/src/components/search/job-detail-pane.tsx`

Replace the "View Original" link with an "Apply" button. Keep the external link icon in the header for quick access.

- [ ] **Step 1: Add `onApply` prop and new icon imports**

Update the interface:

```typescript
interface JobDetailPaneProps {
  job: Job | null
  open: boolean
  onClose: () => void
  onTrack: (job: Job) => void
  onApply?: (job: Job) => void
  onTailor?: (job: Job) => void
  onCoverLetter?: (job: Job) => void
  tracked: boolean
}
```

Update destructured props:

```typescript
export function JobDetailPane({
  job,
  open,
  onClose,
  onTrack,
  onApply,
  onTailor,
  onCoverLetter,
  tracked,
}: JobDetailPaneProps) {
```

Add `Send` and `Zap` to the lucide imports:

```tsx
import {
  ExternalLink,
  Plus,
  Sparkles,
  FileText,
  AlertCircle,
  Send,
  Zap,
} from "lucide-react"
```

- [ ] **Step 2: Replace "View Original" link with "Apply" button**

In the action buttons section, replace the `<a>` tag for "View Original" with:

```tsx
{job.url && onApply ? (
  <button
    type="button"
    onClick={() => onApply(job)}
    className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ml-auto ${
      job.easyApply
        ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
        : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
    }`}
  >
    {job.easyApply ? <Zap size={12} /> : <Send size={12} />}
    Apply
  </button>
) : (
  <a
    href={job.url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-xs font-semibold px-3 py-1.5 rounded-md text-zinc-500 hover:text-blue-600 border border-zinc-200 hover:border-blue-200 transition-colors flex items-center gap-1.5 ml-auto"
  >
    <ExternalLink size={12} /> View Original
  </a>
)}
```

This preserves the "View Original" link as a fallback when `onApply` is not provided.

- [ ] **Step 3: Verify no existing functionality removed**

Read the full modified file and confirm:
- Track/Tracking toggle still works
- Tailor button unchanged
- Cover Letter button unchanged
- External link icon in header still present
- DetailSkeleton, DetailError, DetailContent subcomponents unchanged

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/search/job-detail-pane.tsx
git commit -m "feat: SCRUM-190 add Apply button to job detail pane"
```

---

### Task 5: Wire ApplyFlow into Search Page

**Files:**
- Modify: `dashboard/src/app/(main)/search/page.tsx`

This is the orchestration task — connecting ApplyFlow to state management and passing callbacks through to JobCard and JobDetailPane.

- [ ] **Step 1: Add import and state**

Add import at the top of the file:

```tsx
import { ApplyFlow } from "@/components/search/apply-flow"
```

Add state inside `SearchPage()` function, after the cover letter state:

```tsx
// Apply flow state
const [applyJob, setApplyJob] = useState<Job | null>(null)
```

- [ ] **Step 2: Create handleApply and handleApplied functions**

Add after the existing handler functions (after `handleTrackAndTailor`):

```tsx
function handleApply(job: Job) {
  setApplyJob(job)
}

async function handleApplied(job: Job) {
  const key = jobKey(job)
  // Check if already tracked
  const existing = applications.find(
    (a) =>
      a.title.toLowerCase() === job.title.toLowerCase() &&
      a.company.toLowerCase() === job.company.toLowerCase()
  )

  if (existing) {
    // Update status to "applied" — useApplications auto-sets date_applied
    await updateApplication(existing.id, { status: "applied" })
  } else {
    // Track + apply in one step
    setSessionTracked((prev) => new Set(prev).add(key))
    const result = await addApplication(job, "search")
    if (result?.data?.id) {
      await updateApplication(result.data.id, { status: "applied" })
      // Attach pre-generated content if any
      const savedResume = tailoredResumesRef.current.get(key)
      const savedLetter = coverLettersRef.current.get(key)
      if (savedResume || savedLetter) {
        await updateApplication(result.data.id, {
          ...(savedResume ? { tailored_resume: savedResume } : {}),
          ...(savedLetter ? { cover_letter: savedLetter } : {}),
        })
        tailoredResumesRef.current.delete(key)
        coverLettersRef.current.delete(key)
      }
    }
  }

  await logActivity(`Applied to ${job.title} at ${job.company}`)
  setApplyJob(null)
}
```

Also add `logActivity` to the imports from `@/hooks/use-activity-log`:

```tsx
import { logActivity } from "@/hooks/use-activity-log"
```

- [ ] **Step 3: Create helper to get content for a job**

Add a helper function that checks both in-memory refs and the tracked application record:

```tsx
function getJobContent(job: Job): { tailoredResume: string | null; coverLetter: string | null } {
  const key = jobKey(job)
  // Check in-memory refs first (pre-track stashed content)
  const refResume = tailoredResumesRef.current.get(key) ?? null
  const refLetter = coverLettersRef.current.get(key) ?? null

  // Then check tracked application record
  const tracked = applications.find(
    (a) =>
      a.title.toLowerCase() === job.title.toLowerCase() &&
      a.company.toLowerCase() === job.company.toLowerCase()
  )

  return {
    tailoredResume: refResume || tracked?.tailored_resume || null,
    coverLetter: refLetter || tracked?.cover_letter || null,
  }
}
```

- [ ] **Step 4: Pass onApply to JobCard**

In the JSX where `<JobCard>` is rendered, add the `onApply` prop:

```tsx
<JobCard
  key={`${job.title}-${job.company}-${index}`}
  job={job}
  onTrack={handleTrack}
  onApply={handleApply}
  onTailor={handleTailor}
  onCoverLetter={(j) => setCoverLetterJob(j)}
  onTrackAndTailor={handleTrackAndTailor}
  onViewDetails={setDetailJob}
  tracked={isTracked(job)}
  isNew={isNew(job)}
/>
```

- [ ] **Step 5: Pass onApply to JobDetailPane**

In the JSX where `<JobDetailPane>` is rendered, add the `onApply` prop:

```tsx
<JobDetailPane
  job={detailJob}
  open={!!detailJob}
  onClose={() => setDetailJob(null)}
  onTrack={handleTrack}
  onApply={handleApply}
  onTailor={handleTailor}
  onCoverLetter={(j) => setCoverLetterJob(j)}
  tracked={detailJob ? isTracked(detailJob) : false}
/>
```

- [ ] **Step 6: Render ApplyFlow dialog**

Add after the `<JobDetailPane>` JSX, before the closing `</div>`:

```tsx
{/* Apply Flow Modal */}
{applyJob && (() => {
  const content = getJobContent(applyJob)
  return (
    <ApplyFlow
      job={applyJob}
      isOpen={!!applyJob}
      onClose={() => setApplyJob(null)}
      onApplied={handleApplied}
      tailoredResume={content.tailoredResume}
      coverLetter={content.coverLetter}
      onTailor={handleTailor}
      onCoverLetter={(j) => setCoverLetterJob(j)}
    />
  )
})()}
```

- [ ] **Step 7: Verify no existing functionality removed**

Read the full modified file and confirm:
- All existing state variables unchanged
- handleTrack, handleTailor, handleTrackAndTailor unchanged
- ProfileChips, SearchControls, sort selector, error display unchanged
- TailorModal and CoverLetterModal rendering unchanged
- JobDetailPane rendering preserved (only `onApply` prop added)

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/app/\(main\)/search/page.tsx
git commit -m "feat: SCRUM-190 wire ApplyFlow into search page"
```

---

### Task 6: Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the build**

```bash
cd dashboard && npm run build
```

Expected: Build passes with no errors. Warnings about unused vars are OK to investigate but should not block.

- [ ] **Step 2: Run tests**

```bash
cd dashboard && npm test 2>/dev/null || echo "No test script"
python -m pytest tests/ -v
```

- [ ] **Step 3: Final file verification**

Read each modified file one more time and verify:
1. `job-card.tsx` — Track, Tailor, Cover Letter, Track+Tailor buttons all present. Apply button added to both tracked and untracked sections.
2. `job-detail-pane.tsx` — Track/Tracking toggle, Tailor, Cover Letter buttons unchanged. "Apply" replaces "View Original" when `onApply` provided, falls back otherwise. External link in header still present.
3. `search/page.tsx` — All existing imports, state, handlers, and JSX preserved. ApplyFlow state and handlers added. `onApply` passed to JobCard and JobDetailPane.
4. `apply-flow.tsx` — New file, Dialog with checklist and confirmation views.
5. `010_add_cover_letter_and_events.sql` — Migration with `IF NOT EXISTS` guards.

- [ ] **Step 4: Commit any fixes, then final commit**

```bash
git add -A
git status
# If there are changes from fixes:
git commit -m "fix: SCRUM-190 build fixes"
```

---

## Definition of Done Checklist

- [ ] `apply-flow.tsx` created with pre-apply checklist and confirmation flow
- [ ] Clipboard copy for resume and cover letter (or "Coming soon" fallback)
- [ ] "Open Application" opens external URL in new tab
- [ ] "Did you apply?" confirmation creates/updates Supabase application record
- [ ] `cover_letter` column + `application_events` table migration created
- [ ] Apply button added to Job Detail Pane (SCRUM-188)
- [ ] Apply button added to JobCard (tracked + untracked)
- [ ] Easy Apply detection and badge display
- [ ] Activity log entry on successful apply
- [ ] Toast notifications on all actions
- [ ] No files rewritten from scratch — all targeted edits
- [ ] Build passes
