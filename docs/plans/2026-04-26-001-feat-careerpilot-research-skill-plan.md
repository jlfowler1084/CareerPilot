---
title: "feat: CareerPilot Research Skill + Dashboard Research Tab"
type: feat
status: active
date: 2026-04-26
ticket: CAR-183
origin: docs/brainstorms/2026-04-26-careerpilot-research-skill-requirements.md
---

# feat: CareerPilot Research Skill + Dashboard Research Tab

## Overview

Add a Claude Code slash-command skill (`/careerpilot-research`) that runs the proven multi-source research methodology (Tavily + Firecrawl + LinkedIn employee mining + disambiguation) against a company and writes a structured markdown artifact to `docs/research/`. Add a Research tab to the dashboard application row that renders the markdown when present. Modify the existing CAR-182 prep-pack source assembler to append a `## Deep Research` section to its source `.txt` when an artifact matches the application's company.

This work fixes a class of factual errors in today's Intelligence layer (HQ city wrong, headcount wrong, tech stack listing tools that aren't the company's) by giving the prep-pack pipeline access to evidence-anchored, citation-backed research instead of Haiku-recited training-data hallucinations.

## Problem Frame

Today's Intelligence generator at [dashboard/src/lib/intelligence/generators/company-brief.ts](dashboard/src/lib/intelligence/generators/company-brief.ts) makes a single Haiku call with a system prompt that says "research thoroughly using web search" — but Haiku has no web-search tool bound to that call. The model improvises from training data, producing plausible-looking but factually wrong content. A live demonstration on 2026-04-26 (Irving Materials prep) showed that running the existing `web-research` skill in Claude Code (Tavily + Firecrawl + LinkedIn cert mining) produces a dramatically richer, citation-backed dossier in ~20 minutes for ~10 Tavily searches and 3 Firecrawl scrapes.

The user does not want to rebuild that pipeline server-side (would force a paid Vercel tier, secret management for two more API keys, and a job queue for long-running calls). The research already works in Claude Code; the gap is that its output doesn't flow into the prep-pack pipeline. This plan closes that loop.

(see origin: `docs/brainstorms/2026-04-26-careerpilot-research-skill-requirements.md`)

## Requirements Trace

- **R1.** Slash-command skill `/careerpilot-research` exists at `.claude/skills/careerpilot-research/SKILL.md` and accepts a company name as its argument.
- **R2.** Skill writes a markdown file to `docs/research/<company-slug>-<YYYY-MM-DD>.md` following the documented 10-section schema (Snapshot → Key People → Tech Stack → Strategic Context → Glassdoor → Questions to Ask → Talking Points → Domain Vocabulary → Sources). The `<company-slug>` is the **underscore-form** output of [dashboard/src/lib/prep-pack/naming.ts](dashboard/src/lib/prep-pack/naming.ts) `slugify()` (e.g., `Irving Materials` → `irving_materials`, `J.D. Irving, Limited` → `jd_irving_limited`). The date suffix uses `-` separators, so a typical filename is `irving_materials-2026-04-26.md`.
- **R3.** Every factual claim in the artifact carries a source URL + access date; inferred facts carry a confidence rating (high / medium / low).
- **R4.** Skill applies disambiguation: cross-references at least one structured field (domain, address, phone) before consuming results to avoid name collisions (e.g., Irving Materials vs J.D. Irving vs Commercial Metals "Irving").
- **R5.** Dashboard application page has a Research tab that renders the markdown when a file matches `<application.company-slug>-*.md`, picking the latest by date suffix.
- **R6.** Research tab shows an empty-state instructional message when no file matches: `No research yet. Run /careerpilot-research <company-name> in Claude Code.`
- **R7.** Prep-pack wizard's source `.txt` (CAR-182) includes the research as a `## Deep Research` section when an artifact exists for the application's company; no-op otherwise (graceful degradation).
- **R8.** Citations preserved end-to-end (skill output → tab render → prep-pack source).
- **R9.** CAR-182 prep-pack export pipeline remains unchanged below the source-assembler layer.
- **R10.** `docs/research/*.md` is gitignored by default (privacy); user can opt in to commit specific files via `git add -f`.

## Scope Boundaries

- No server-side Tavily/Firecrawl integration. All research API calls happen in Claude Code where the user's keys and quota live.
- No Supabase schema migration. Research is keyed by company slug, not by ticket — the existing `application.company` column is sufficient.
- No replacement of the existing Intelligence generator. Intelligence stays as the fast/cheap baseline; Research is supplementary.
- No auto-run from the dashboard. Trigger is exclusively the slash command.
- No editable Research tab in the dashboard. Editing happens in the user's text editor against the markdown file.
- No Discord notification on skill completion (skill runs synchronously in Claude Code; the user is already there).
- No per-role / per-application research differentiation. One research file per company, latest by date wins. (Per-role candidate-fit gap analysis is a v2 feature.)

### Deferred to Separate Tasks

- Company-level research cache architecture beyond filesystem (Supabase mirror, search index): future ticket if/when needed.
- Editable Research tab in the dashboard: future ticket.
- Auto-refresh research when the JD is updated: future ticket.
- Research-driven candidate-fit gap analysis as its own generator (the "Microsoft → Workspace mappings" angle): v2 ticket.
- Server-side Tavily/Firecrawl integration if the dashboard ever deploys to a hosted environment: future ticket, only if needed.

## Context & Research

### Relevant Code and Patterns

- [.claude/skills/web-research/SKILL.md](C:/Users/Joe/.claude/skills/web-research/SKILL.md) (global skill) — exact methodology this new skill wraps. Three-tier routing (Tavily → Firecrawl → WebFetch), `.research/` working directory, mandatory citation discipline. Has `tools/tavily-search.py` helper.
- [.claude/skills/skill-creator/SKILL.md](C:/Users/Joe/.claude/skills/skill-creator/SKILL.md) (global skill) — defines the spec. Project-scoped skills go in `<project>/.claude/skills/<name>/`. Required: `SKILL.md` with frontmatter (`name`, `description`, optionally `allowed-tools`).
- [dashboard/src/app/api/intelligence/[applicationId]/route.ts](dashboard/src/app/api/intelligence/[applicationId]/route.ts) — pattern to mirror for the new research API route: async params (`{ params }: { params: Promise<{ applicationId: string }> }` then `await params`), Supabase auth.
- [dashboard/src/components/intelligence/intelligence-tab.tsx](dashboard/src/components/intelligence/intelligence-tab.tsx) — content-rendering pattern (NOT a tab container; the tab container is the row).
- [dashboard/src/components/applications/application-row.tsx](dashboard/src/components/applications/application-row.tsx) — actual `Tabs/TabsList/TabsTrigger/TabsContent` registration site. Today has two tabs: `details` and `intelligence`. Add `research` as a third sibling.
- [dashboard/src/lib/intelligence/resume-context.ts](dashboard/src/lib/intelligence/resume-context.ts) — exports `RESUME_SUMMARY` and `RESUME_SKILLS_LIST`. The skill reads this file as text for the Talking Points section (the skill runs in Claude Code, not in-process with Next.js).
- [dashboard/src/types/index.ts](dashboard/src/types/index.ts) — `Application` interface; confirmed has `company` field (string), no `jira_ticket`.
- **CAR-182 worktree branch** (`worktree/CAR-182-prep-pack-export`):
  - `dashboard/src/lib/prep-pack/assemble-source.ts` — `assembleSource(intel, customFocus)` exported function returning `string`. Builds `sections: string[]` then joins with `\n\n`. The natural seam: append a final section after the last `if (ip.stageTips...)` push.
  - `dashboard/src/lib/prep-pack/types.ts` — `IntelligenceSnapshot`, `WizardConfig`.
  - `dashboard/src/lib/prep-pack/naming.ts` — exports `slugify`. **Reuse this for the company→slug normalization in the research route.**
  - `dashboard/src/components/applications/prep-pack-modal.tsx` — calls `assembleSource(intelligence, effectiveCustomFocus)` inside a `useMemo`. This is the call site we'll modify to also fetch research and pass it.

### Institutional Learnings

- [docs/solutions/car-pilot-subagent-swarm-learnings.md](docs/solutions/car-pilot-subagent-swarm-learnings.md) (Friction Point 2) — if implementation happens in a worktree, run `npm install` and copy `.env.local` from main checkout before `npm run build` or `dev`. Worktrees inherit `.git` but not gitignored files.

### External References

- None. Local patterns are sufficient for every implementation unit.

## Key Technical Decisions

- **Match strategy: company-slug, not ticket-key.** Research is naturally company-level; multiple roles at the same company share the same research file. Zero schema migration. Aligns with v1 scope (per-role candidate-fit deferred to v2). (User-confirmed during planning.)
- **Filename pattern: `<company-slug>-<YYYY-MM-DD>.md`** where `<company-slug>` is the **underscore-form** output of `slugify()` from [dashboard/src/lib/prep-pack/naming.ts](dashboard/src/lib/prep-pack/naming.ts). Concrete examples: `irving_materials-2026-04-26.md`, `jd_irving_limited-2026-04-26.md`. The mixed underscore-in-slug + hyphen-as-date-separator is awkward to read but unambiguous to parse (regex anchor: `^${slug}-\d{4}-\d{2}-\d{2}\.md$`). The skill MUST reuse the existing `slugify()` rules verbatim (or call out to the same logic) to guarantee the dashboard's matcher finds the file. Slug-first sorts by company in `ls`. Date suffix supports keeping prior runs as audit trail; latest by date wins on lookup.
- **Filesystem location resolved as `path.resolve(process.cwd(), '..', 'docs', 'research')`.** The dashboard's cwd is `dashboard/` (per CAR-182's prep-pack route), so traversing up one level to repo root then into `docs/research/` is reliable.
- **Privacy-by-default: `docs/research/*.md` is gitignored.** Research artifacts may contain candidate-tailored content the user doesn't want versioned. User can opt-in to commit specific files via `git add -f`.
- **Skill is project-local at `.claude/skills/careerpilot-research/`, not global.** The methodology is CareerPilot-specific (output schema tied to prep-pack contract); versioning it in the repo means the skill evolves with the project.
- **Skill takes only a company name as argument.** No ticket coupling, no Supabase fetch — the user pastes the JD into the conversation when they want the skill to incorporate role-specific context. Keeps the skill stateless and easy to reason about.
- **`react-markdown` + `remark-gfm` are new dependencies.** No existing markdown renderer in the dashboard. `remark-gfm` covers GitHub-flavored tables (citations are markdown tables in our schema).
- **Hard dependency on CAR-182 merge.** The prep-pack assembler integration touches files that only exist on `worktree/CAR-182-prep-pack-export`. Implementation cannot start on Unit 5 (assembler integration) until CAR-182 is merged into `feature/dashboard-v2`.

## Open Questions

### Resolved During Planning

- **Should the skill auto-fetch the JD from Supabase?** No. v1 takes only a company name; user pastes the JD into the Claude Code conversation when role context is needed. Keeps the skill stateless and avoids Supabase service-role auth in the skill.
- **Filename ordering: ticket-first vs slug-first?** Moot — we're not using tickets. Slug-first: `<company-slug>-<YYYY-MM-DD>.md`.
- **`--refresh` archive vs keep-all?** Keep all prior runs, sort by date desc, latest wins. Disk space is cheap; archives are useful for diffs.
- **Step 2 wizard preview: research separate or merged inline?** Merged inline as a `## Deep Research` section appended after Intelligence content. The user already edits the source `.txt` in Step 2, so they can manually rearrange if they prefer.
- **Tab placement: inside `IntelligenceTab` or peer of it?** Peer at the `application-row.tsx` level. `IntelligenceTab` today is a flat content panel, not a tab container.

### Deferred to Implementation

- Exact `react-markdown` styling overrides for headings, code blocks, and tables to match the dashboard's design tokens. Decide once the rendered output is visible in the dev server.
- Whether the `Application` type needs a small extension to expose `company-slug` derivable client-side, or whether the API route does the slugify (favor: API route).
- The exact prose of the Research tab empty state. Polish in implementation.

## Implementation Units

- [ ] **Unit 1: Author the `careerpilot-research` skill**

**Goal:** Codify the multi-source research methodology as a project-local Claude Code skill with the CareerPilot output schema and disambiguation discipline.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None.

**Files:**
- Create: `.claude/skills/careerpilot-research/SKILL.md`

**Approach:**
- Frontmatter: `name: careerpilot-research`, `description: ...` (pushy, per skill-creator guidance), optionally `allowed-tools` if any are needed beyond defaults.
- Body declares the 5-angle decomposition (company facts, tech stack, named personnel, strategic context, recent news), the disambiguation pre-check (cross-reference ≥1 structured field — domain, address, phone — before consuming results), the LinkedIn employee-cert mining pattern, and the citation discipline (URL + access date on every claim, confidence rating on every inferred fact).
- Output schema: 10 markdown sections matching the requirements doc (Snapshot → Key People → Tech Stack → Strategic Context → Glassdoor → Questions to Ask → Talking Points → Domain Vocabulary → Sources).
- Filename: `docs/research/<company-slug>-<YYYY-MM-DD>.md` where `<company-slug>` is the **underscore-form** produced by [dashboard/src/lib/prep-pack/naming.ts](dashboard/src/lib/prep-pack/naming.ts) `slugify()`. The skill SKILL.md must include a "Slug rules" section quoting the slugify normalization (lowercase, strip punctuation except spaces, collapse runs of `[/\\\s\-]+` into a single underscore) so the file always matches the dashboard's matcher. Concrete examples: `Irving Materials` → `irving_materials-2026-04-26.md`, `J.D. Irving, Limited` → `jd_irving_limited-2026-04-26.md`.
- Skill accepts the company name as a positional argument and an optional `--refresh` flag. With `--refresh`, the skill writes a new file with today's date even if a prior file for the same slug exists; without it, the skill warns if today's file already exists and prompts the user before overwriting.
- Skill includes a "Talking Points" synthesis step that reads `dashboard/src/lib/intelligence/resume-context.ts` as text to ground candidate-specific framings.
- Tier-1/Tier-2 routing rules inherited verbatim from the global `web-research` skill: Tavily by default, Firecrawl on JS-heavy pages, WebFetch as last resort.

**Patterns to follow:**
- [C:/Users/Joe/.claude/skills/web-research/SKILL.md](C:/Users/Joe/.claude/skills/web-research/SKILL.md) — methodology source
- [C:/Users/Joe/.claude/skills/skill-creator/SKILL.md](C:/Users/Joe/.claude/skills/skill-creator/SKILL.md) — frontmatter conventions

**Test scenarios:**
- Test expectation: none — skills are markdown documents loaded by Claude Code at runtime, not unit-testable in this repo. Verification is hand-run.

**Verification:**
- Invoking the skill against a known company (e.g., `Irving Materials` from the existing `.research/synthesis.md`) produces a markdown file at `docs/research/irving_materials-2026-04-26.md` (note underscore in slug) with all 10 documented sections present, citations dated, confidence ratings on every inferred fact, and disambiguation steps visible in the agent's working notes.
- Invoking with `--refresh` against a slug that already has today's file produces a second file dated today (or, if same-date collision is impossible by design, prompts before overwriting).

---

- [ ] **Unit 2: Establish `docs/research/` storage with privacy-by-default**

**Goal:** Create the artifact directory and gitignore .md files by default while keeping the directory tracked.

**Requirements:** R10

**Dependencies:** None. Independent of Unit 1.

**Files:**
- Create: `docs/research/.gitkeep` (empty file)
- Modify: `.gitignore` (add `docs/research/*.md` and a `!docs/research/.gitkeep` exception)

**Approach:**
- The `.gitkeep` makes the directory visible in `git ls-files` so other contributors see it exists.
- Gitignore pattern: ignore `*.md` inside `docs/research/`, never ignore `.gitkeep`.

**Test scenarios:**
- Test expectation: none — pure config.

**Verification:**
- `git status` after creating a sample `.md` file in `docs/research/` shows nothing (file is ignored).
- `git ls-files docs/research/` shows `.gitkeep`.
- `git add -f docs/research/sample.md` succeeds (force-add still works for opt-in).

---

- [ ] **Unit 3: Add `react-markdown` + `remark-gfm` to the dashboard**

**Goal:** Install the markdown rendering dependencies needed by the Research tab.

**Requirements:** R5

**Dependencies:** None. Independent of Units 1 and 2.

**Files:**
- Modify: `dashboard/package.json`
- Modify: `dashboard/package-lock.json` (auto-updated by npm)

**Approach:**
- Run `npm install react-markdown remark-gfm` from `dashboard/`.
- No XSS-sanitization layer needed — content originates from the user's local filesystem (skill output the user has the chance to edit), not user input.
- `remark-gfm` is required for GFM tables; the research artifact uses tables for the company snapshot and tech-stack confidence ratings.

**Test scenarios:**
- Happy path: `npm run build` from `dashboard/` succeeds with no TypeScript errors after the new deps land.

**Verification:**
- `import ReactMarkdown from 'react-markdown'` resolves without TypeScript or runtime errors in the next.js dev server.
- `npm run build` exits 0.

---

- [ ] **Unit 4: Add `/api/research/[applicationId]` route**

**Goal:** API endpoint that returns the latest research markdown for an application's company, or a 404 with empty-state hint.

**Requirements:** R5, R6

**Dependencies:** Unit 2 (directory must exist for the route to scan it without erroring).

**Files:**
- Create: `dashboard/src/app/api/research/[applicationId]/route.ts`
- Create: `dashboard/src/__tests__/api/research.test.ts`

**Approach:**
- GET handler. Read `applicationId` via `await params` (Next.js 16 async-params pattern, mirror `intelligence/[applicationId]/route.ts`).
- Authenticate via Supabase server client (mirror existing intelligence route pattern).
- Look up the application row (`applications` table, scoped by `user_id`). 404 if not found / not authorized.
- Slugify `application.company` (reuse `slugify()` from `dashboard/src/lib/prep-pack/naming.ts` if CAR-182 is merged; otherwise re-implement inline as a tight function — flag for refactor once CAR-182 lands).
- Resolve research dir: `path.resolve(process.cwd(), '..', 'docs', 'research')`.
- `fs.readdir` the research dir; filter `.md` files matching pattern `^${slug}-\d{4}-\d{2}-\d{2}\.md$`; sort descending; pick the first.
- If no match, return JSON `{ found: false, slug, hint: "Run /careerpilot-research <company-name> in Claude Code" }` with status 404.
- If match, return JSON `{ found: true, filename, slug, markdown: <file contents> }` with status 200.
- Use `fs/promises` (async); never block the event loop.

**Patterns to follow:**
- [dashboard/src/app/api/intelligence/[applicationId]/route.ts](dashboard/src/app/api/intelligence/[applicationId]/route.ts) — async params, Supabase auth, GET handler shape

**Test scenarios:**
- **Happy path:** application exists, single matching file → returns 200 with `{ found: true, filename, markdown }`.
- **Edge case (no file):** application exists, no matching file → returns 404 with `{ found: false, slug, hint }`.
- **Edge case (multiple files):** two files for same slug, different dates → returns the file with the later date.
- **Edge case (subtle slug):** company name with special chars (e.g., `J.D. Irving, Limited`) slugifies consistently with `slugify()` from `dashboard/src/lib/prep-pack/naming.ts` and matches `jd_irving_limited-*.md` (underscore form, periods/commas stripped). Test should call the actual `slugify()` rather than hardcoding the expected slug, to keep skill ↔ matcher behavior locked together.
- **Error path (missing applicationId):** returns 400.
- **Error path (application not found):** returns 404 with `{ error: "Application not found" }` (distinct from `found: false` — that's "no research file"; this is "no application").
- **Error path (cross-tenant):** authenticated user requests another user's application → returns 404 (don't leak existence).
- **Edge case (research dir missing):** route handles gracefully (returns 404 `found: false` rather than crashing).

**Verification:**
- All 8 test scenarios pass under Vitest.
- Manually hitting `/api/research/<real-application-id>` from a browser returns the expected shape.

---

- [ ] **Unit 5: Build the Research tab component**

**Goal:** Render the research markdown in a new tab on the application row, with empty/loading/error states.

**Requirements:** R5, R6, R8

**Dependencies:** Units 3 (markdown deps) and 4 (API route).

**Files:**
- Create: `dashboard/src/components/intelligence/research-tab.tsx`
- Modify: `dashboard/src/components/applications/application-row.tsx` (add `<TabsTrigger value="research">Research</TabsTrigger>` + `<TabsContent value="research">`)
- Create: `dashboard/src/__tests__/components/research-tab.test.tsx`

**Approach:**
- Component fetches `/api/research/[applicationId]` on mount via the dashboard's existing data-fetching idiom (TanStack Query if used elsewhere in the row; native `useEffect`+`fetch` otherwise — confirm by reading `intelligence-tab.tsx` data fetching).
- States:
  - **Loading:** spinner.
  - **Empty (404 found:false):** instructional card with the **original company name** (not the slug) pre-filled in the suggested command. Example: `No research yet. Run /careerpilot-research "Irving Materials" in Claude Code.` (use the human-readable company name from `application.company`, not the slug — the skill slugifies internally). Optionally include a copy-to-clipboard button for the command.
  - **Error:** generic error card with retry button.
  - **Loaded:** `<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>` rendered inside a styled wrapper that respects the dashboard's typography and `prose` Tailwind classes if present.
- Tab registration in `application-row.tsx`: third sibling alongside `details` and `intelligence`. Use the existing shadcn `Tabs` component.

**Patterns to follow:**
- [dashboard/src/components/intelligence/intelligence-tab.tsx](dashboard/src/components/intelligence/intelligence-tab.tsx) — content panel structure
- [dashboard/src/components/applications/application-row.tsx](dashboard/src/components/applications/application-row.tsx) lines 366–580 — tab wiring

**Test scenarios:**
- **Happy path:** mock fetch returns `{ found: true, markdown: "# Test\n\n| a | b |\n|---|---|\n| 1 | 2 |" }` → component renders an `<h1>` and a `<table>`.
- **Empty state:** mock fetch returns 404 `{ found: false, slug: "test_co" }` and an application with `company: "Test Co"` → component renders text containing both `Run` and `Test Co` (the human-readable company, not the slug).
- **Loading state:** fetch is pending → component renders a spinner element.
- **Error state:** fetch rejects → component renders an error message with a retry affordance.
- **Integration:** clicking the Research tab in `application-row.tsx` mounts the component and triggers the fetch (assert via spy on `fetch`).

**Verification:**
- All 5 test scenarios pass under Vitest.
- Visual smoke test in `npm run dev`: an application with a matching research file shows headings/tables/links rendered correctly; an application without one shows the empty state with the right slug.

---

- [ ] **Unit 6: Wire research into the prep-pack source assembler**

**Goal:** When a research artifact exists for an application, the prep-pack wizard's source `.txt` includes a `## Deep Research` section appended after the existing Intelligence sections.

**Requirements:** R7, R8, R9

**Dependencies:** **CAR-182 must be merged into `feature/dashboard-v2` before this unit can start.** Units 1, 4 (skill produces files; API route surfaces them — but the assembler reads from the API in this unit, so Unit 4 is a hard prereq).

**Files:**
- Modify: `dashboard/src/lib/prep-pack/assemble-source.ts` (add optional `researchMarkdown?: string` parameter; append section when present)
- Modify: `dashboard/src/components/applications/prep-pack-modal.tsx` (fetch research from `/api/research/[applicationId]` in parallel with intelligence; pass `researchMarkdown` into `assembleSource()`)
- Modify: `dashboard/src/lib/prep-pack/assemble-source.test.ts` (sibling test on CAR-182 branch; add 3 new scenarios)

**Approach:**
- Pure-function extension in `assembleSource()`: new optional third parameter `researchMarkdown?: string`. After the last existing `sections.push(...)` block (the stage-tips guard), add:
  ```
  if (researchMarkdown && researchMarkdown.trim()) {
    sections.push(`## Deep Research\n\n${researchMarkdown.trim()}`);
  }
  ```
  *(directional — the implementer should match the local code style for guard expressions and conditional pushes.)*
- In `prep-pack-modal.tsx`, fetch research alongside intelligence (parallel `Promise.all` if not already, otherwise add an additional `useQuery`/effect). Pass the markdown text (or `undefined` on 404) into `assembleSource(intelligence, customFocus, researchMarkdown)`.
- Backwards-compat: if `researchMarkdown` is `undefined` or empty, behavior is identical to today. All existing CAR-182 tests pass unchanged.

**Patterns to follow:**
- Existing CAR-182 `assembleSource()` structure on `worktree/CAR-182-prep-pack-export`.

**Test scenarios:**
- **Happy path (research present):** call `assembleSource(snapshot, "focus", "# Research\n\nbody")` → output ends with `\n\n## Deep Research\n\n# Research\n\nbody`.
- **Edge case (research undefined):** call `assembleSource(snapshot, "focus")` → output is byte-identical to the current CAR-182 behavior (regression check).
- **Edge case (empty research string):** call `assembleSource(snapshot, "focus", "")` → no `## Deep Research` section appended.
- **Edge case (whitespace-only research):** call `assembleSource(snapshot, "focus", "   \n  ")` → no section appended.
- **Integration:** in `prep-pack-modal.tsx`, mount the modal for an application with a matching research file; assert the Step 2 textarea includes `## Deep Research` and the research markdown body.

**Verification:**
- All 5 test scenarios pass.
- Existing CAR-182 tests in `assemble-source.test.ts` remain green.
- Manual smoke in `npm run dev`: open the prep-pack modal for an application with a `docs/research/` file; Step 2 textarea includes the research section.

---

- [ ] **Unit 7: Register Research feature in `feature-manifest.json`**

**Goal:** Add the new Research tab and skill flow to the regression manifest so `tools/regression-check.sh` covers it.

**Requirements:** R5

**Dependencies:** Units 4, 5 (the feature must exist before it's registered).

**Files:**
- Modify: `dashboard/feature-manifest.json` (add Research tab entries — specific manifest schema TBD when reading the file; mirror the CAR-182 prep-pack registration pattern from commit `4fd77d5`)

**Approach:**
- Read the current manifest schema; add entries describing:
  - The `/api/research/[applicationId]` route (presence check for the file).
  - The `<TabsTrigger value="research">` element in `application-row.tsx` (string match check).
  - The `research-tab.tsx` component file (presence check).

**Patterns to follow:**
- Commit `4fd77d5` (CAR-182 prep-pack registration) — same shape

**Test scenarios:**
- Test expectation: none — pure manifest registration.

**Verification:**
- `tools/regression-check.sh` runs and reports the Research feature as PASS both before and after a no-op edit of the relevant files.

## System-Wide Impact

- **Interaction graph:** New API route is read-only and stateless (no Supabase writes). Research tab is read-only. Prep-pack modal gains one additional fetch, no changes to its write path.
- **Error propagation:** Filesystem errors (dir missing, file unreadable) in the research route degrade to `{ found: false }` rather than 500. Research tab renders an error state but doesn't block other tabs.
- **State lifecycle risks:** None new. The skill writes to disk; the dashboard reads from disk. There's no shared mutable state.
- **API surface parity:** `/api/research/[applicationId]` mirrors the shape of `/api/intelligence/[applicationId]` for consistency.
- **Integration coverage:** Unit 5 (Research tab) and Unit 6 (assembler) both rely on the Unit 4 API route — integration tests there cover the full data path.
- **Unchanged invariants:**
  - The Intelligence generator (`company-brief.ts`, `interview-prep.ts`) is not modified. It continues to produce its output as before.
  - The `applications` table schema is not modified.
  - CAR-182's prep-pack export pipeline below `assembleSource()` (route handler, pwsh subprocess invocation, SB-Autobook contract) is unchanged. Unit 6 only adds an optional input to `assembleSource()`.
  - `prep-pack-modal.tsx` Step 2 UI does not change beyond the source `.txt` content; no new buttons, toggles, or fields.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **CAR-182 merge slips, blocking Unit 6.** | Units 1–5 are independent of CAR-182 and can ship as a separate PR. Unit 6 ships after CAR-182 lands; the rest still delivers user value (Research tab works standalone — user can copy/paste from it into prep-pack Step 2 manually). |
| **Skill output drifts from the dashboard's expected schema** (e.g., section names change). | Schema is documented in the requirements doc and embedded in the skill's prompt. The Research tab uses `react-markdown` for rendering, so any well-formed markdown displays without breakage even if section order shifts. The prep-pack assembler appends the entire markdown blob, not a parsed structure, so schema drift doesn't break Unit 6. |
| **`slugify()` mismatch between skill output and dashboard.** Skill produces kebab-form `irving-materials`; dashboard's `slugify()` produces underscore-form `irving_materials` and finds no match. **(Real risk — slugify uses underscores, not hyphens.)** | The skill SKILL.md MUST include the slugify normalization rules verbatim (lowercase, strip punctuation except spaces, collapse `[/\\\s\-]+` to single underscore). Unit 4 test must call the actual `slugify()` from `naming.ts` rather than hardcoding expected slugs, to keep skill ↔ matcher behavior locked together. The mixed underscore-in-slug + hyphen-as-date-separator is intentional; both regex anchors and human readability still parse. |
| **Tavily/Firecrawl quotas exhausted mid-run.** | Skill inherits the global `web-research` skill's quota check (refuses Tier-2 escalation when Firecrawl is below 20%). If Tavily exhausts, skill falls back to `WebFetch` and labels output confidence as `medium` instead of `high`. |
| **Research files contain candidate-tailored content the user doesn't want versioned.** | Privacy-by-default: `docs/research/*.md` is gitignored (Unit 2). User opts in per-file via `git add -f` if they want to commit. |
| **Next.js 16 async-params pattern unfamiliar to implementer.** | [dashboard/AGENTS.md](dashboard/AGENTS.md) flags this. Plan includes the exact reference file (`intelligence/[applicationId]/route.ts`) to mirror. Reading `node_modules/next/dist/docs/` recommended before writing the route. |
| **Worktree implementation: missing `node_modules` / `.env.local`.** | Per `docs/solutions/car-pilot-subagent-swarm-learnings.md` Friction Point 2: in any worktree, run `npm install` and copy `.env.local` from the main checkout before `npm run dev` or `build`. |

## Documentation / Operational Notes

- Add a one-paragraph README section to `docs/research/.gitkeep` (or a sibling `README.md`) describing the convention: filename pattern, what the skill produces, how the dashboard finds files. Keeps onboarding-friendly.
- Update `dashboard/CLAUDE.md` Data Layer section: note that research artifacts are filesystem-only by design (no Supabase mirroring), keyed by company slug.
- No rollout/migration concerns. The new tab degrades gracefully when no research file exists.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-26-careerpilot-research-skill-requirements.md](docs/brainstorms/2026-04-26-careerpilot-research-skill-requirements.md)
- **Predecessor ticket:** CAR-182 (prep-pack export wizard) — must merge into `feature/dashboard-v2` before Unit 6 begins.
- **Methodology source:** [C:/Users/Joe/.claude/skills/web-research/SKILL.md](C:/Users/Joe/.claude/skills/web-research/SKILL.md)
- **Skill spec:** [C:/Users/Joe/.claude/skills/skill-creator/SKILL.md](C:/Users/Joe/.claude/skills/skill-creator/SKILL.md)
- **Live demo synthesis:** `.research/synthesis.md` (Irving Materials run, 2026-04-26) — concrete example of the artifact this skill produces.
- **Worktree setup gotcha:** [docs/solutions/car-pilot-subagent-swarm-learnings.md](docs/solutions/car-pilot-subagent-swarm-learnings.md) Friction Point 2.
