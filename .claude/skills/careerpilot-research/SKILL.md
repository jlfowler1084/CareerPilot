---
name: careerpilot-research
description: Run deep, citation-backed company research for a CareerPilot job application. Wraps the global web-research skill (Tavily decomposition + Firecrawl escalation + LinkedIn employee mining + disambiguation) and produces a structured markdown artifact at docs/research/<company-slug>-<YYYY-MM-DD>.md that the dashboard's Research tab and the prep-pack source assembler both consume. Use when the user wants to populate or refresh research for a CareerPilot application — typical triggers include "research X", "deep research on Acme Corp", "/careerpilot-research <company>", or asking to populate the Research tab for an application. Always prefer this over the global web-research skill when the work is about a CareerPilot application — the schema, slug, and output path are all wired to the dashboard.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch, WebSearch, AskUserQuestion
---

# careerpilot-research

CareerPilot-specific deep-research skill. Runs the proven multi-source research methodology against a company and writes a structured markdown artifact the dashboard and prep-pack pipeline both consume.

## When to use

Use whenever the user asks for research on a company tied to a CareerPilot job application — recruiter prep, interview prep, application tailoring, or refreshing stale Intelligence-tab data. Concrete triggers:

- "Research <company>" / "Do deep research on <company>"
- "/careerpilot-research <company>"
- "Populate the Research tab for <application>"
- "The Intelligence tab on this app is wrong — fix it"

**Do NOT use this skill for:**
- General web research not tied to a CareerPilot application → use the global `web-research` skill
- Single-URL fetches → use `firecrawl-scrape` or `WebFetch`
- Library / framework documentation → use `context7` MCP
- Researching a person's background unrelated to a company application → use `web-research`

## Invocation

```
/careerpilot-research "<company name>"           # canonical
/careerpilot-research "<company name>" --refresh # force a new file even if today's exists
```

Pass the company name as a single positional argument. Quote it if it contains spaces. The user can paste the job description into the conversation when role-specific framings (Talking Points, Questions to Ask) need it; the skill treats the JD as optional context.

## Output contract — read this before doing anything

The skill produces exactly one file: `docs/research/<company-slug>-<YYYY-MM-DD>.md`.

The slug must be produced by the canonical `slugify()` rules from `dashboard/src/lib/prep-pack/naming.ts`:

```
slug =
  input
    .toLowerCase()
    .replace(/[\/\\\s\-]+/g, '_')   // slashes, spaces, hyphens → single underscore
    .replace(/[^a-z0-9_]/g, '')     // strip everything else (periods, commas, &, etc.)
    .replace(/_+/g, '_')            // collapse runs of underscores
    .replace(/^_+|_+$/g, '');       // trim leading/trailing underscores
```

**Concrete examples** — the skill MUST produce these exact filenames:

| Input | Slug | Filename |
|---|---|---|
| `Irving Materials` | `irving_materials` | `irving_materials-2026-04-26.md` |
| `J.D. Irving, Limited` | `jd_irving_limited` | `jd_irving_limited-2026-04-26.md` |
| `Acme/Foo Corp.` | `acme_foo_corp` | `acme_foo_corp-2026-04-26.md` |
| `M&M Industries` | `mm_industries` | `mm_industries-2026-04-26.md` |

The mixed underscore-in-slug + hyphen-as-date-separator is intentional. The dashboard's matcher uses the regex `^${slug}-\d{4}-\d{2}-\d{2}\.md$`. Do not invent a different separator.

If the input slugifies to an empty string, refuse to write a file and ask the user for a clearer company name.

## Workflow

### Phase 0 — Setup

1. Ensure `docs/research/` exists (create with `mkdir -p` if not).
2. Compute the slug from the company name using the rules above.
3. Compute today's date: `YYYY-MM-DD`.
4. Check whether `docs/research/<slug>-<YYYY-MM-DD>.md` already exists:
   - If it exists and `--refresh` was passed: proceed and overwrite at the end.
   - If it exists and `--refresh` was NOT passed: ask the user "Today's research file for this company already exists. Refresh it (overwrite), keep both (write a `-2` suffix), or cancel?"
   - If it doesn't exist: proceed.
5. Create the working directory `.research/` (gitignored) for intermediate Tavily/Firecrawl outputs.

### Phase 1 — Disambiguation pre-check

Before consuming any results, lock down the company identity. Name collisions are the #1 source of bad research (e.g., "Irving Materials" vs "J.D. Irving" vs "Commercial Metals headquartered in Irving, TX").

Run a single targeted Tavily query for `"<company name>" official website headquarters` and confirm at least ONE of:
- Domain (the company's primary `.com`)
- Street address with city/state
- Phone number

Note the canonical identity in your working notes:

```
CANONICAL IDENTITY
  Name: <official name>
  Domain: <primary domain>
  HQ: <city, state>
  Phone: <phone if found>
```

For every subsequent result, cross-reference at least one of these three fields. Discard results that match the company name alone but contradict the canonical identity.

### Phase 2 — Decompose into 5 angles

Always decompose into exactly these five sub-queries before any breadth searches:

1. **Company facts** — `"<company>" headquarters founded revenue employees subsidiaries`
2. **Tech stack signals** — `"<company>" job posting OR careers IT systems administrator OR engineer` plus a Firecrawl scrape of the company's careers page
3. **Named personnel** — `site:linkedin.com/in "<company>" IT OR director OR VP OR engineer` for IT-titled employees; mine LinkedIn profiles for certifications (Okta, AWS, etc.) as tech-stack inference signals
4. **Strategic context** — `"<company>" acquisition OR expansion OR layoffs <year>` plus industry-specific tailwinds (regulatory pressure, vendor licensing shifts, M&A)
5. **Reviews / culture** — `"<company>" Glassdoor` and `"<company>" Indeed reviews`

Run sub-queries 1, 2, 3, 4 in parallel (separate background Bash invocations of `~/.claude/skills/web-research/tools/tavily-search.py`). Run 5 after the others so you can drop it if the first four already saturate the picture.

### Phase 3 — Tier routing per result

Inherit the global web-research skill's three-tier routing:

| Tier | Tool | When |
|------|------|------|
| 1 | Tavily search | Default. Search + page markdown + AI answer in one call. |
| 2 | Firecrawl scrape | Specific URL Tavily returned with thin/empty `raw_content` (paywall, JS-rendered SPA, login wall). Notably: company careers pages, LinkedIn profile pages. |
| 3 | Built-in WebFetch | Final fallback if both APIs fail or are exhausted. |

Quota check before any Firecrawl call: `firecrawl --status`. If credits are below 20%, refuse Tier 2 and fall straight to Tier 3.

### Phase 4 — Triage, cross-check, synthesize

Triage every result by source authority before consuming `raw_content`:

- **Primary** (official site, vendor case studies, government filings, NRMCA-style trade-association pages) > secondary (Datanyze/ZoomInfo aggregators, Glassdoor) > tertiary (Medium, dev.to)
- **Recency** — for "current state" queries, anything > 12 months old is suspect
- **Tavily's `score`** — relevance, not authority. Use as a tiebreaker, not a ranker

A claim that appears in only one source is a hypothesis, not a fact. Either find it in ≥2 independent sources OR mark it explicitly as "per [source]" OR flag the disagreement.

For inferred facts (i.e., not directly stated in any source but derivable from public artifacts), assign a **confidence rating**:

| Rating | Meaning | Example |
|--------|---------|---------|
| **high** | Multiple corroborating signals from primary sources | "Uses Okta as IdP — IT supervisor's LinkedIn shows Okta Certified Professional cert; careers page leaks `irvmat.rec.pro.ukg.net`" |
| **medium** | One primary source or two corroborating secondary sources | "Likely uses BCMI for dispatch — customer portal links to bcmi.app/materialnow" |
| **low** | Single secondary source or aggregator data | "Datanyze lists Marketo in tech tags" |

### Phase 5 — Write the artifact

Write `docs/research/<slug>-<YYYY-MM-DD>.md` with the following structure. **Section names and order are part of the contract** — the dashboard rendering and the prep-pack source assembler depend on them.

```markdown
---
title: <Company Name> — Research Brief
date: <YYYY-MM-DD>
company: <Company Name>
slug: <slug>
sources_count: <number of distinct URLs cited>
---

# <Company Name> — Research Brief

## Company Snapshot

[Fact table with citations. Required fields: Legal name, HQ address, Founded, Ownership, Revenue, Employees, Footprint, Subsidiaries. Each fact has a source URL + access date in the right column.]

## Key People

[Named personnel with titles, LinkedIn URLs, education/certs. Highlight IT-titled employees especially. If you found a certification on a LinkedIn profile that implies a tech-stack tool, note it here AND in Tech Stack.]

## Tech Stack

### Confirmed (from JD or recruiter)
[List items with the source — JD URL, recruiter notes, etc.]

### Inferred from public artifacts
[Table with columns: Tool | Source signal | Confidence (high/medium/low). Inferences from leaked subdomains, customer-portal apps, employee certs, cookie disclosures, vendor case studies.]

### Unknown — open questions to ask in interview
[Bulleted list of stack questions you couldn't answer from public sources. These become "questions to ask" candidates.]

## Strategic Context

[Industry tailwinds, recent vendor licensing shifts (e.g., VMware-Broadcom), M&A landscape, sustainability angles, regulatory pressure. Each claim cited.]

## Glassdoor / Reviews

[Overall rating, sub-scores (pay, WLB, culture, career, recommend-to-friend, business outlook). Headline themes from reviews. Caveats on WLB if scores are role-segmented (e.g., plant-side vs corporate-side).]

## Recent News

[3-5 dated headlines or developments. Skip if the search returned nothing; do not fabricate.]

## Questions to Ask in Interview

[8-10 evidence-grounded questions, each anchored in a finding from this artifact. Format: question + one-line "why this matters" rationale.]

## Talking Points (Candidate-Specific)

[Map JD requirements to candidate experience. Use `dashboard/src/lib/intelligence/resume-context.ts` (read as text) for candidate background. If the JD wasn't pasted, write generic role-aware framings.]

## Domain Vocabulary

[Industry-specific glossary. 5-10 terms specific to the company's industry that a candidate from outside the industry should be comfortable with. e.g., for ready-mix concrete: aggregates, batch plant, e-ticket, soil stabilization.]

## Sources

[Full citation list, grouped by sub-query. Format per entry: `[Title](URL) — accessed YYYY-MM-DD`. Group headers: `### Q1 — Company facts`, `### Q2 — Tech stack`, etc.]
```

### Phase 6 — Verify and report

Before declaring done, self-check:

- [ ] All 10 sections present (Snapshot, Key People, Tech Stack, Strategic Context, Glassdoor, Recent News, Questions to Ask, Talking Points, Domain Vocabulary, Sources)
- [ ] Every factual claim outside Sources has an inline citation or "per [source]" attribution
- [ ] Every inferred tech-stack entry has a confidence rating
- [ ] Sources section has ≥1 entry per consumed sub-query
- [ ] Filename matches the canonical slug pattern exactly
- [ ] Disambiguation step is documented (canonical identity captured before consuming results)

Report to the user:
- Filename written
- Sub-queries run and their result counts
- Tier-2/3 escalations (if any)
- Anything you flagged as low-confidence so the user can verify

## Anti-patterns specific to this skill

- **Single-query research** — produces single-source bias. Always decompose into the 5 angles.
- **Inventing a kebab slug** — slugify uses underscores. `irving-materials` is wrong; `irving_materials` is right.
- **Citing without dates** — strips the reader's ability to judge currency. If you cannot find a publication date, write `(date unknown)` — never guess.
- **Conflating same-name companies** — the disambiguation pre-check exists because "Irving" matches at least three unrelated companies. Do not skip it.
- **Burying confidence ratings** — every inferred fact in Tech Stack must have an explicit `high/medium/low` tag. The dashboard relies on these.
- **Silently dropping sources** — every URL consumed must appear in the Sources section, even if its content was discarded as irrelevant. The audit trail matters.

## Setup notes

- Skill assumes the global `web-research` skill is installed at `~/.claude/skills/web-research/` (it is; this skill calls its tools).
- Skill assumes `firecrawl` CLI is on PATH (`firecrawl --status` returns valid output).
- Skill writes to `docs/research/` (gitignored by default; user can opt-in to commit specific files).
- Working directory `.research/` is also gitignored.

## Related work

- Methodology source: `~/.claude/skills/web-research/SKILL.md`
- Slugify source-of-truth: `dashboard/src/lib/prep-pack/naming.ts:slugify` (CAR-182)
- Consuming surfaces: `dashboard/src/components/intelligence/research-tab.tsx` (CAR-183 Unit 5), `dashboard/src/lib/prep-pack/assemble-source.ts` (CAR-183 Unit 6, post-CAR-182 merge)
- Live exemplar: `.research/synthesis.md` (Irving Materials, 2026-04-26) — the artifact this skill is modelled on