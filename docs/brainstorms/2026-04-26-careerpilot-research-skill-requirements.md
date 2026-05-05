---
title: CareerPilot Research Skill — Claude Code Slash Command + Dashboard Tab
date: 2026-04-26
status: design-approved-pending-ticket
phase: brainstorm
projects: [CareerPilot]
related:
  - docs/brainstorms/2026-04-25-prep-pack-export-design.md  # CAR-182 prep-pack export wizard (predecessor)
  - dashboard/src/lib/intelligence/generators/company-brief.ts  # current Intelligence generator (Haiku, hallucinates)
  - dashboard/src/lib/intelligence/generators/interview-prep.ts
  - dashboard/src/components/intelligence/intelligence-tab.tsx
  - C:/Users/Joe/.claude/skills/web-research/SKILL.md  # methodology this skill wraps
---

# CareerPilot Research Skill — Design

## Problem

The dashboard's Intelligence layer (`dashboard/src/lib/intelligence/generators/`) makes a single Haiku call with a system prompt that says "research thoroughly using web search" — but Haiku has no web-search tool bound to that call. It generates plausible-looking but wrong content from training data:

- HQ city wrong (Indiana-only, no specific city)
- Headcount wrong (e.g., "2,200 in Indiana" for a company with a 4-state footprint)
- Tech stack lists tools that aren't the company's (Command Alkon listed; Okta, UKG, BCMI absent)
- Personnel absent (no IT VP, no team-lead names)
- No citations, no confidence ratings, no domain-vocabulary

A live demonstration on 2026-04-26 (Irving Materials prep) showed that running the proven `web-research` skill in Claude Code with Tavily decomposition + Firecrawl escalation + LinkedIn employee-cert mining produces a dramatically richer, citation-backed dossier in ~20 minutes for ~10 Tavily searches and 3 Firecrawl scrapes.

The user does not want to rebuild that pipeline server-side in the dashboard (would force a paid Vercel tier, add Tavily/Firecrawl secret management, and require a job queue for long-running calls). The research already works in Claude Code; the gap is that its output doesn't flow back into the prep-pack pipeline.

## Goal

A Claude Code skill, invoked by slash command, that runs the proven multi-source research methodology against a company and writes a structured markdown artifact to `docs/research/`. The dashboard adds a Research tab that renders the artifact when present, and the existing prep-pack export wizard (CAR-182) automatically includes the research in its source `.txt` so the SB-Autobook pipeline produces a tighter, accurately-grounded ebook.

## Non-goals (v1)

- **No server-side Tavily/Firecrawl integration.** Research runs only in Claude Code where the user already has API keys and quota.
- **No replacement of the existing Intelligence generator.** Intelligence stays as-is for fast/cheap baseline output. Research is supplementary, not a substitute.
- **No Supabase schema migration.** Artifacts live on the local filesystem.
- **No auto-run from the dashboard.** Trigger is exclusively the slash command.
- **No company-level caching across applications.** Each application gets its own research file keyed by CAR ticket. Reusable-by-company is a v2 question.
- **No editable Research tab in the dashboard.** The user edits the markdown file directly in their text editor.
- **No Discord notification on completion.** The skill runs synchronously in Claude Code; the user is already there to read the result.

## Confirmed decisions

| # | Decision | Reasoning |
|---|----------|-----------|
| 1 | Skill is a Claude Code slash command, not a dashboard feature | User explicitly chose this to avoid Vercel tier upgrade + secret management + job queue |
| 2 | Storage is markdown file in `docs/research/`, not Supabase column | Dashboard runs locally, filesystem reads work; matches CAR-182 file-based pipeline pattern; zero schema migration; user can edit in VS Code |
| 3 | Filename pattern `<company-slug>-<YYYY-MM-DD>.md` (underscore-form slug per `dashboard/src/lib/prep-pack/naming.ts:slugify`) — **superseded during planning 2026-04-26** | Original decision was ticket-prefixed but `applications` table has no `jira_ticket` column. Planning resolved by switching to company-slug matching, since per-role research differentiation was already deferred to v2. Concrete example: `irving_materials-2026-04-26.md`. Decision recorded in `docs/plans/2026-04-26-001-feat-careerpilot-research-skill-plan.md` Key Technical Decisions section. |
| 4 | Skill wraps the existing `web-research` methodology with CareerPilot-specific output schema | Don't rebuild what works; add structure, not capability |
| 5 | Research is supplementary to Intelligence, not a replacement | Intelligence stays for fast/cheap baseline; Research is the deep-dive layer |
| 6 | Prep-pack wizard auto-includes Research when a matching artifact exists | Closes the loop — runs research → ebook reflects it without manual paste |
| 7 | Dashboard Research tab is read-only markdown render | Editing happens in the user's text editor; tab is for display only |
| 8 | Citations preserved end-to-end (Research → tab render → prep-pack source `.txt`) | Citations are why the artifact is trustworthy; never strip them |

## Architecture

```
┌──────────────────────────────────────┐
│ Claude Code session                  │
│   /careerpilot-research <CAR-ticket> │
│   (or: /careerpilot-research <name>) │
└──────────────┬───────────────────────┘
               │ skill loads, reads ticket from Jira if provided
               │ runs web-research methodology:
               │   Tavily decomposition (5 sub-queries)
               │   Firecrawl escalation for SPAs
               │   LinkedIn employee-cert mining
               │   Disambiguation (avoid name collisions)
               │   Citation discipline (URL + access date)
               ▼
┌──────────────────────────────────────┐
│ docs/research/                       │
│   CAR-182-irving-materials-2026-04-26.md  │
│   <ticket>-<slug>-<date>.md          │
└──────────────┬───────────────────────┘
               │
               ├─► Dashboard Research tab
               │   GET /api/research/[applicationId]
               │     reads file by ticket key, renders markdown
               │
               └─► Prep-pack wizard Step 2 source assembler
                   prepends or appends "## Deep Research" section
                   to the existing Intelligence-derived .txt
                   (existing SB-Autobook pipeline unchanged)
```

## Research artifact schema (markdown sections)

Each research markdown file follows this structure (proven on the Irving Materials run):

1. **Frontmatter** — title, company, date, sources count, ticket reference
2. **Company Snapshot** — fact table with citations (HQ, founded, revenue, employees, footprint, subsidiaries, ownership)
3. **Key People** — named personnel with titles, LinkedIn URLs, education/certs
4. **Tech Stack** — split into:
   - Confirmed (from JD or recruiter)
   - Inferred from public artifacts (with confidence rating + source per entry)
   - Unknown — open questions to ask in interview
5. **Strategic Context** — industry tailwinds, vendor licensing shifts, sustainability angles, M&A landscape
6. **Glassdoor / Reviews** — ratings + headline themes
7. **Questions to Ask in Interview** — 8–10 evidence-grounded questions
8. **Talking Points (Candidate-Specific)** — JD-requirement → candidate-experience mapping
9. **Domain Vocabulary** — industry-specific glossary
10. **Sources** — full citation list, grouped by sub-query, with dates

## Skill scope

**Location:** Project-local at `.claude/skills/careerpilot-research/SKILL.md` (versioned with the repo so the methodology is reproducible across machines).

**Invocation patterns:**
- `/careerpilot-research <CAR-ticket>` — fetches company name + JD from the application row in Supabase, runs research, writes artifact named with ticket key
- `/careerpilot-research <company-name>` — runs research without a ticket binding, writes artifact with date-only filename, user can rename later if a ticket emerges
- `/careerpilot-research <CAR-ticket> --refresh` — forces a re-run even if an artifact exists, writes new file with updated date suffix

**Methodology codified in skill:**
- Mandatory 5-angle decomposition: company facts, tech stack, named personnel, strategic context, recent news
- Disambiguation pre-check: never trust a single source on a company name; cross-reference at least one structured field (domain, address, phone) before consuming results
- LinkedIn employee mining: search for IT-titled employees by company; surface social URLs and certifications as tech-stack signals
- Confidence ratings on every inferred fact: high / medium / low based on source authority and corroboration
- Citation discipline: every factual claim has source URL + access date; uncited claims explicitly labeled as "candidate's own experience" or removed

## Dashboard work (minimum viable)

1. **New API route** `dashboard/src/app/api/research/[applicationId]/route.ts`
   - GET: fetch application by id, read `docs/research/<ticket>-*.md` (latest if multiple), return markdown
   - 404 if no file matches
2. **New tab component** `dashboard/src/components/intelligence/research-tab.tsx`
   - Renders markdown via `react-markdown` (already a dep, used elsewhere)
   - Empty state: "No research yet. Run `/careerpilot-research <ticket>` in Claude Code."
3. **Wiring in IntelligenceTab** to add the Research tab alongside existing tabs
4. **Prep-pack source assembler** (`dashboard/src/lib/prep-pack/source-assembler.ts` per CAR-182 commit history)
   - After existing Intelligence sections are assembled, check for a research file matching the ticket
   - If found, append a "## Deep Research" section to the source `.txt`
   - If not found, no-op (graceful degradation)

## Acceptance criteria (v1)

1. Skill exists at `.claude/skills/careerpilot-research/SKILL.md` and is invocable as `/careerpilot-research`
2. Skill accepts either a CAR ticket key or a company name as argument
3. Skill writes a markdown file to `docs/research/` matching the documented filename pattern
4. Skill output follows the documented schema (sections 1–10 above) with citations and confidence ratings
5. Dashboard application page has a "Research" tab that renders the markdown when a file exists
6. Research tab shows an empty-state instructional message when no file matches
7. Prep-pack wizard's source `.txt` includes the research content as a "## Deep Research" section when an artifact exists for the application's ticket
8. Citations (URLs + dates) are preserved end-to-end from skill output → tab render → prep-pack source
9. Existing CAR-182 prep-pack export pipeline remains unchanged below the source-assembler layer (skill produces source; SB-Autobook consumes source — no change)
10. `docs/research/` is added to `.gitignore` by default; user can opt in to commit individual files

## Out-of-scope follow-ups (capture for later)

- Company-level research cache reusable across multiple applications at the same company
- Editable Research tab in the dashboard (versus text-editor edits today)
- Auto-refresh research when the application's JD is updated
- Discord notification when skill completes a run
- Research diff view (compare two runs of the same company over time)
- Research-driven gap analysis as its own generator (the Microsoft → Workspace mappings angle)
- Server-side Tavily/Firecrawl integration if the dashboard ever deploys to a hosted environment

## Cost & quota notes

- Tavily free tier: 1,000 requests/month. One research run uses ~5–10 sub-queries → 100+ runs/month available
- Firecrawl free tier: 500 credits/month. One research run uses ~3 escalation scrapes → 150+ runs/month available
- All API costs stay on the user's existing Claude Code accounts; no new secret management, no Vercel tier upgrade
- LLM cost (synthesis after research): runs in Claude Code conversation context, no incremental API spend beyond normal session usage

## Effort estimate

- Skill (`.claude/skills/careerpilot-research/SKILL.md`): 1 day — codify methodology, define output schema, write skill prompt
- Dashboard API route: 0.5 day
- Dashboard Research tab component + wiring: 0.5 day
- Prep-pack source assembler change: 0.5 day
- Tests + regression manifest update: 0.5 day
- **Total: ~3 days of focused work**

## Open questions for planning phase

- Should the skill optionally fetch the JD text from the Supabase application row when given a ticket key, or always require the user to paste the JD into the conversation? (Auto-fetch is nicer; requires Supabase service-role access from the skill)
- Filename ordering: `CAR-182-irving-materials-2026-04-26.md` vs `irving-materials-CAR-182-2026-04-26.md` — affects sort behavior in `ls`
- Whether to delete or archive prior research files when `--refresh` is used (default: keep all, sort by date desc)
- Whether the prep-pack wizard's Step 2 source preview should show the research content separately or merged inline (UX detail)
