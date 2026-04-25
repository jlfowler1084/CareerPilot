---
title: Prep Pack Export — CareerPilot → SB-Autobook Wizard
date: 2026-04-25
status: design-approved-pending-spec-review
phase: brainstorm
projects: [CareerPilot, SecondBrain, EbookAutomation]
tickets: [CAR-182]
related:
  - F:\Obsidian\SecondBrain\Resources\SB-PSModules\Public\Utility\AutobookCmdlets.ps1
  - F:\Projects\EbookAutomation\module\EbookAutomation.psm1
  - F:\Obsidian\SecondBrain\Resources\project-dependencies.json
---

# Prep Pack Export — Design Spec

## Problem

Manual workflow today: open a CareerPilot application → copy each Intelligence section by hand → paste into a `.txt` on the desktop → drop into `F:\Obsidian\SecondBrain\Inbox\` → run `Invoke-SBAutobook` from a PowerShell prompt → optionally run a separate Calibre cmdlet for EPUB/AZW3/KFX → wait → check vault for output.

Result: a personalized interview-prep ebook + audiobook pair (the "Prep Pack"). The current Delta Faucet artifacts in [Learning/Audiobooks/](F:\Obsidian\SecondBrain\Learning\Audiobooks\) prove the back half of the pipeline works; this spec automates the front half.

## Goal

A single button on the CareerPilot application card that opens a two-step wizard, assembles a curated source `.txt` from the application's Intelligence data, lets the user edit it before submission, and triggers the existing SB-Autobook + Calibre pipeline as a background subprocess. The user gets a Discord notification when artifacts are ready.

## Non-goals (v1)

- A job queue. One render at a time is fine; if the user clicks twice the second job runs in parallel and writes to a different timestamped path.
- Status polling / live progress UI inside CareerPilot. Discord on completion is the discovery channel.
- Re-inventing the Calibre / TTS pipeline. We're composing existing cmdlets, not rewriting them.
- A new MessageBus message type. RPC and pub/sub are different; don't conflate them.
- A daemon, a service, or any new always-on process.

## Confirmed decisions

| # | Decision | Source |
|---|----------|--------|
| 1 | Two-step wizard with custom-instructions field | Q1 |
| 2 | Direct subprocess transport — `pwsh Invoke-SBAutobook ...` | Q2 |
| 3 | Source `.txt` ordered: Custom Focus → Career Narrative → Why Fits → Company Snapshot → Tech Stack → Recent News → Red Flags → Likely Questions → Gaps → Talking Points → Questions to Ask → Questions to Research → Stage Tips | Q3, Q4 |
| 4 | Empty Intelligence sections are silently omitted | Q4 |
| 5 | Discord webhook on subprocess success and failure | Q5 |
| 6 | Output naming: `{Company}_{JobTitle}_Prep_{YYYY-MM-DD-HHMM}` stem, never overwrite | Q6 |
| 7 | Wizard format section: MP3 always produced; "Also produce a Kindle ebook" toggle (default ON) with KFX/AZW3 radio (KFX default, AZW3 fallback). EPUB dropped — it's a Calibre intermediate, not a final output. | Q7, Q9 |
| 8 | Button label "Prep Pack", placed below "Cover Letter" in the application card stack | Q8 |

## Architecture

```
┌──────────────────────────────────┐
│ CareerPilot dashboard            │
│ Application card                 │
│   [Tailor]                       │
│   [Cover Letter]                 │
│   [Prep Pack]  ◄── new button    │
│   [Delete]                       │
└──────────────┬───────────────────┘
               │
               │ click
               ▼
┌──────────────────────────────────┐
│ Wizard Step 1 — Configure        │
│  Voice  ○ Steffan ○ Aria         │
│         ○ Jenny   ○ Guy          │
│  Depth  ○ Quick ● Standard ○ Deep│
│  Mode   ● Single book ○ 3-book   │
│         series                   │
│  Formats ☑ MP3 ☑ EPUB            │
│         ☐ AZW3 ☐ KFX             │
│  Custom Instructions             │
│  ┌────────────────────────────┐  │
│  │ free-form text             │  │
│  └────────────────────────────┘  │
│        [Next: Preview ▶]         │
└──────────────┬───────────────────┘
               │
               │ assemble Intelligence into .txt
               ▼
┌──────────────────────────────────┐
│ Wizard Step 2 — Preview & Edit   │
│  Editable textarea, preloaded    │
│  with assembled source. User can │
│  trim, reorder, add notes.       │
│        [◀ Back]   [Render ▶]     │
└──────────────┬───────────────────┘
               │
               │ POST /api/prep-pack
               ▼
┌──────────────────────────────────┐
│ CareerPilot backend handler      │
│  1. Write input .txt to          │
│     F:\Obsidian\SecondBrain\     │
│     Inbox\<stem>.txt             │
│  2. Spawn pwsh subprocess,       │
│     detached background          │
│  3. Return 202 Accepted to UI    │
└──────────────┬───────────────────┘
               │
               │ subprocess
               ▼
┌──────────────────────────────────┐
│ pwsh -NoProfile -Command         │
│   Invoke-SBAutobook              │
│     -Path <input.txt>            │
│     -Voice <choice>              │
│     -Depth <choice>              │
│     -Mode <Single|Series>        │
│     -CustomInstructions <text>   │
│     -Formats <MP3,EPUB,AZW3,KFX> │
│                                  │
│ Inside Invoke-SBAutobook:        │
│   - Generate vault note          │
│   - Format-SBAutobookSSML        │
│   - Convert-ToTTS → MP3          │
│   - ConvertTo-SBAutobookKindle   │
│       (which calls               │
│        Convert-ToKindle for      │
│        EPUB/AZW3/KFX as needed)  │
└──────────────┬───────────────────┘
               │
               │ on exit
               ▼
┌──────────────────────────────────┐
│ Subprocess wrapper script        │
│  - Read exit code + transcript   │
│  - Inspect output dir to confirm │
│    which formats actually landed │
│  - POST Discord webhook with     │
│    company, files, runtime,      │
│    actual-vs-requested formats   │
└──────────────────────────────────┘
```

## Components

### CP-1: Application card "Prep Pack" button
Lives in the JSX dashboard component that renders application cards. Identical styling to the existing Tailor / Cover Letter buttons. Disabled with a tooltip when the application's Intelligence data is empty (no Company Research and no Interview Prep populated).

### CP-2: Wizard modal (Step 1 — Configure)
Five field groups: Voice radio, Depth radio, Mode radio (Single book vs 3-book series), Formats checkboxes (4), and Custom Instructions textarea. "Next" button transitions to Step 2.

### CP-3: Wizard modal (Step 2 — Preview & Edit)
Single large editable textarea preloaded with the assembled source text. The assembly happens client-side or in a server endpoint (decision deferred to implementation plan; depends on whether Intelligence data is already in the React state when the card renders). "Back" returns to Step 1 preserving choices. "Render" submits.

### CP-4: Backend endpoint `POST /api/prep-pack`
Receives: full Step 1 config + final edited source text + application ID. Writes the input `.txt` to the vault Inbox path (see naming convention below), spawns the pwsh subprocess detached, returns 202 with the planned output stem so the UI can show "rendering started, file will be at …".

### CP-5: Subprocess wrapper (PowerShell)
A small script in CareerPilot's `tools/` (TBD location during implementation) that:
1. Invokes `Invoke-SBAutobook` with the requested parameters.
2. Captures stdout/stderr to a transcript file.
3. After exit, inspects the canonical output directories to enumerate the artifacts that actually got produced (defends against silent KFX→AZW3 fallback in `Convert-ToKindle`).
4. Posts a Discord webhook with:
   - On success: company name, application title, runtime, requested-vs-actual formats, file paths.
   - On failure: company name, exit code, last 30 lines of transcript, link to full log.

### SB-1: `Invoke-SBAutobook` — no parameter changes needed (verified)
Existing cmdlet at [Resources/SB-PSModules/Public/Utility/AutobookCmdlets.ps1:692](F:\Obsidian\SecondBrain\Resources\SB-PSModules\Public\Utility\AutobookCmdlets.ps1) already has every parameter we need:
- `-Voice` (Steffan/Guy/Aria/Jenny — matches our wizard) ✓
- `-Depth` (Quick/Standard/Deep) ✓
- `-FromFile <path>` — points at the Inbox `.txt` ✓
- `-Structure {Single|Auto|Manual}` — `Auto` = series, `Single` = single-book (matches our wizard's Mode radio) ✓
- `-ProduceKindle` switch — chains into `ConvertTo-SBAutobookKindle` ✓
- `-OutputPrefix <string>` — for our timestamp-suffixed naming ✓

**Custom Focus / instruction-block convention** ([AutobookCmdlets.ps1:735–747](F:\Obsidian\SecondBrain\Resources\SB-PSModules\Public\Utility\AutobookCmdlets.ps1)): if the source file starts with `### Instructions` followed by free-form guidance, the cmdlet parses, strips, and forwards it to the planner as authoritative for split decisions, emphasis, and exclusions. We prepend the wizard's Custom Focus text under this heading. **No new parameter.** Hard rule: never pass `-Purpose` alongside the instruction block (cmdlet throws on conflict at line 886-890).

### SB-2: `ConvertTo-SBAutobookKindle` — verified to chain into Calibre
[AutobookCmdlets.ps1:216–352](F:\Obsidian\SecondBrain\Resources\SB-PSModules\Public\Utility\AutobookCmdlets.ps1) calls `Convert-ToKindle` from EbookAutomation at line 310. **One Kindle file per run.** Format (KFX or AZW3) is config-driven via `$cfg.kindle.output_format` in EbookAutomation. The wizard's KFX/AZW3 radio drives a config override at subprocess-launch time, not a cmdlet parameter. Pre-flight check: Calibre GUI must be closed (cmdlet warns at line 301-305).

## Data flow

1. User clicks Prep Pack on application `<id>`.
2. CareerPilot fetches the application's full Intelligence record from Supabase (existing query — no schema changes).
3. Wizard Step 1 collects config; Step 2 assembles `.txt` from Intelligence + Custom Instructions.
4. User edits in the preview textarea, clicks Render.
5. Backend writes `.txt` to `F:\Obsidian\SecondBrain\Inbox\<stem>.txt`.
6. Backend spawns `pwsh tools/run-prep-pack.ps1 -InputFile <path> -Voice ... -Depth ... -Mode ... -Formats ... -CustomInstructions ...` with `-WindowStyle Hidden` and detached.
7. Backend returns 202 to the UI with the expected output paths.
8. Subprocess produces artifacts in `Learning/Audiobooks/`, `EbookAutomation/output/balabolka-txt/`, `EbookAutomation/output/audiobooks/`, and (if requested) `EbookAutomation/output/ebooks/`.
9. Subprocess wrapper posts to Discord webhook on completion or failure.

## File naming convention

Stem: `{CompanySlug}_{JobTitleSlug}_Prep_{YYYY-MM-DD-HHMM}`

Where slugs are produced by lowercasing, replacing spaces and slashes with `_`, and stripping non-`[a-z0-9_]` characters.

Example for the Irving Materials test target:
```
irving_materials_it_network_and_sys_admin_prep_2026-04-25-1830.txt
irving_materials_it_network_and_sys_admin_prep_2026-04-25-1830.md   (vault note)
irving_materials_it_network_and_sys_admin_prep_2026-04-25-1830.mp3
irving_materials_it_network_and_sys_admin_prep_2026-04-25-1830.epub
```

Series mode produces three suffixed audio files plus a series-index markdown note, mirroring [Delta_Faucet_Prep_Material_Series_2026-04-08.md](F:\Obsidian\SecondBrain\Learning\Audiobooks\Delta_Faucet_Prep_Material_Series_2026-04-08.md).

## Source-text assembly contract

Order is fixed; sections with empty source data are omitted entirely (no empty headings). Field-to-section mapping:

| Section heading | Source field(s) in CareerPilot Intelligence |
|-----------------|----------------------------------------------|
| `## Custom Focus (from wizard)` | wizard `customInstructions` (only if non-empty) |
| `## Career Narrative Angle` | Interview Prep → career_narrative_angle |
| `## Why This Role Fits` | Company Research → why_youre_a_good_fit |
| `## Company Snapshot` | culture, headcount, funding_stage, glassdoor (rendered as bullets) |
| `## Tech Stack` | tech_stack list |
| `## Recent News` | recent_news bullets |
| `## Red Flags to Be Aware Of` | red_flags |
| `## Likely Interview Questions` | Interview Prep → likely_questions[] (each as `### {q}` followed by answer) |
| `## Gaps to Address` | gaps_to_address |
| `## Talking Points` | talking_points |
| `## Questions to Ask Them` | questions_to_ask |
| `## Questions to Research Before the Interview` | questions_to_research |
| `## Stage Tips` | stage_tips |

## Discord notification contract

**Channel:** existing ClaudeInfra Ops channel (verify webhook URL during implementation).

**Success message** (one Discord embed):
- Title: `Prep Pack ready: {Company} — {JobTitle}`
- Fields: Runtime, Source-text-words, Audiobook-minutes, Formats produced (with green checkmarks for delivered, yellow for fallback like KFX→AZW3, gray for skipped/requested-but-failed)
- Footer: full vault path stem, click-to-copy

**Failure message:**
- Title: `Prep Pack FAILED: {Company} — {JobTitle}`
- Fields: Exit code, last 30 lines of transcript, link to full transcript file
- Footer: input `.txt` path so the user can retry manually if needed

## Failure handling

- Subprocess crash mid-render: transcript file persists; Discord failure message points to it. Partial artifacts (e.g., MP3 done but EPUB failed) are not deleted — they're reported as "produced" in the success message.
- Calibre missing or KFX plugin missing: handled by `Convert-ToKindle`'s existing fallback (KFX → AZW3 → log warning). Wrapper detects the fallback by inspecting actual files vs. requested formats and reports it as a yellow checkmark.
- Discord webhook unreachable: subprocess wrapper logs a warning to the transcript and continues. Artifacts on disk are the source of truth.
- Empty Intelligence at click time: button is disabled with tooltip "Intelligence is empty — fill in Company Research or Interview Prep first." (See CP-1.)

## New cross-project dependency to register

After implementation, [project-dependencies.json](F:\Obsidian\SecondBrain\Resources\project-dependencies.json) needs a new edge:

```json
{
  "from": "CareerPilot",
  "to": "SecondBrain",
  "type": "content-pipeline",
  "summary": "CareerPilot Prep Pack wizard writes assembled source .txt to vault Inbox and invokes Invoke-SBAutobook subprocess",
  "interfaces": [
    "Filesystem: Inbox/<company>_<title>_Prep_<timestamp>.txt",
    "Subprocess: pwsh -NoProfile -Command Invoke-SBAutobook -Path ... -Voice ... -Depth ... -Mode ... -CustomInstructions ... -Formats ..."
  ],
  "tickets": ["TBD"]
}
```

Existing edge `SecondBrain → EbookAutomation` (content-pipeline, `Invoke-SBAutobook` calls Balabolka) remains unchanged and is the downstream half of this flow.

## Tickets to file before implementation

| Project | Board | Likely scope |
|---------|-------|--------------|
| CareerPilot | CAR | Button + wizard + backend endpoint + subprocess wrapper + Discord webhook |
| SecondBrain | SB | `Invoke-SBAutobook` parameter additions (`-CustomInstructions`, `-Mode`, `-Formats`); audit `ConvertTo-SBAutobookKindle` |
| EbookAutomation | SCRUM | Likely no work; possibly a `Convert-ToKindle` parameter pass-through if format selection isn't already plumbed |

The CareerPilot ticket is the parent; SB and SCRUM tickets become blockers if `Invoke-SBAutobook` doesn't already accept the new params. Verify during the writing-plans phase before opening the SB and SCRUM tickets.

## Verified during writing-plans investigation

1. ✅ `Invoke-SBAutobook` parameters cover everything we need — no SB-side cmdlet changes required.
2. ✅ `ConvertTo-SBAutobookKindle` chains into `Convert-ToKindle` automatically.
3. ✅ CareerPilot dashboard is **Next.js 16 + React 19 + TypeScript + shadcn + Supabase SSR + vitest**. New backend route lives at `src/app/api/prep-pack/route.ts`.
4. Discord webhook + application-card component path: resolved during plan-writing pass.
5. Wizard assembly: backend endpoint owns it (deterministic, testable, unit-testable in vitest).

## Tickets to file before implementation

| Project | Board | Likely scope |
|---------|-------|--------------|
| CareerPilot | **CAR-182** (filed) | Button + wizard + backend endpoint + subprocess wrapper + Discord webhook (≈ all the work) |
| ~~SecondBrain~~ | ~~SB~~ | ~~No work needed.~~ Existing cmdlet covers all needs (Q9 spec deviation resolved this). |
| ~~EbookAutomation~~ | ~~SCRUM~~ | ~~No work needed.~~ Calibre wrapper already handles config-driven format selection. |

## Test target

The Irving Materials → IT Network and Sys Admin application has all Intelligence fields populated and is the agreed acceptance test for v1. Successful Prep Pack render against that application is the v1 done criterion.
