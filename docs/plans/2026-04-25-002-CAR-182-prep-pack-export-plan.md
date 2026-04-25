# Prep Pack Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Prep Pack" button to each CareerPilot application card that opens a two-step wizard, assembles a curated source `.txt` from the application's Intelligence data, lets the user edit it, and triggers `Invoke-SBAutobook` as a detached background subprocess that produces a personalized interview-prep audiobook + Kindle ebook pair, with a Discord notification on completion.

**Architecture:** Next.js 16 App Router POST endpoint receives wizard payload → writes input `.txt` to vault Inbox → spawns detached `pwsh` subprocess that runs `Invoke-SBAutobook` → existing SB-Autobook + Calibre pipeline produces artifacts → wrapper script POSTs to existing `/api/discord-relay` on completion. Custom guidance is conveyed via the cmdlet's existing `### Instructions` block convention; no SB-side code changes.

**Tech Stack:** TypeScript, Next.js 16, React 19, shadcn/ui, vitest (unit + integration), PowerShell 7 (`pwsh`), Pester 5 (PS tests).

---

## Pre-flight

### Task 0: File Jira ticket and create worktree

**Files:**
- None (Jira + git operation only)

- [ ] **Step 1: File CAR ticket**

Title: `Prep Pack export — wizard + subprocess pipeline for application intelligence → audiobook/ebook`

Description (paste into Jira): copy the "Goal" and "Confirmed decisions" sections from [docs/brainstorms/2026-04-25-prep-pack-export-design.md](F:\Projects\CareerPilot\docs\brainstorms\2026-04-25-prep-pack-export-design.md).

Note the assigned ticket ID. Subsequent commits use `[CAR-182]` prefix.

- [ ] **Step 2: Create worktree from `feature/dashboard-v2`**

CareerPilot's `origin/HEAD` is `feature/dashboard-v2` (a long-lived integration branch, not `main`). Feature branches fork from it and PR back into it.

Run from `F:\Projects\CareerPilot`:
```bash
git fetch origin
git worktree add .worktrees/CAR-182-prep-pack-export -b worktree/CAR-182-prep-pack-export origin/feature/dashboard-v2
```

The branch name follows the existing CAR naming pattern (`worktree/CAR-NNN-slug`).

- [ ] **Step 3: Verify worktree**

```bash
cd .worktrees/CAR-182-prep-pack-export
git status
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```
Expected: branch `worktree/CAR-182-prep-pack-export`, clean tree, upstream `origin/feature/dashboard-v2`.

All subsequent tasks run inside this worktree.

---

## File Structure

**New files (CareerPilot dashboard):**

| Path | Responsibility |
|------|----------------|
| `dashboard/src/lib/prep-pack/types.ts` | Shared TypeScript types: `WizardConfig`, `IntelligenceSnapshot`, `PrepPackJobRequest`, `PrepPackJobResponse` |
| `dashboard/src/lib/prep-pack/naming.ts` | Pure function: `(company, jobTitle, timestamp) → stem` |
| `dashboard/src/lib/prep-pack/naming.test.ts` | vitest unit tests for slug + timestamp behavior |
| `dashboard/src/lib/prep-pack/assemble-source.ts` | Pure function: `(intelligence, customFocus) → string` (assembled `.txt` body) |
| `dashboard/src/lib/prep-pack/assemble-source.test.ts` | vitest unit tests for ordering, empty-section omission, instruction-block prefix |
| `dashboard/src/lib/prep-pack/adapter.ts` | Pure function: `(application, IntelligenceData) → IntelligenceSnapshot` — bridges the hook's `brief`/`preps[]` shape to the flat snapshot the assembler expects |
| `dashboard/src/lib/prep-pack/adapter.test.ts` | vitest unit tests for adapter, including handling of multi-stage prep records |
| `dashboard/src/components/applications/prep-pack-modal.tsx` | Two-step wizard React component |
| `dashboard/src/app/api/prep-pack/route.ts` | Next.js POST handler — write file, spawn subprocess, return 202 |
| `dashboard/src/app/api/prep-pack/route.test.ts` | vitest integration test using mocked `child_process` |
| `dashboard/tools/run-prep-pack.ps1` | pwsh wrapper that runs `Invoke-SBAutobook` and posts Discord webhook |
| `dashboard/tools/run-prep-pack.Tests.ps1` | Pester tests for wrapper (mocking `Invoke-SBAutobook`) |

**Modified files (CareerPilot dashboard):**

| Path | Reason |
|------|--------|
| `dashboard/src/components/applications/application-row.tsx` | Add Prep Pack button between Cover Letter and Delete |
| `dashboard/feature-manifest.json` | Register new feature for regression-check skill |

**Modified files (cross-project):**

| Path | Reason |
|------|--------|
| `F:\Obsidian\SecondBrain\Resources\project-dependencies.json` | Register new CareerPilot → SecondBrain content-pipeline edge |

---

## Stream A: Pure functions (types, naming, assembly, adapter)

These have zero I/O dependencies and run first to lock the data contract everything else consumes. Tasks A1–A3 are interdependent; A4 (adapter) depends on A1's types and the Supabase row types but is still pure.

### Task A1: Shared types

**Files:**
- Create: `dashboard/src/lib/prep-pack/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// dashboard/src/lib/prep-pack/types.ts

export type Voice = 'Steffan' | 'Aria' | 'Jenny' | 'Guy';
export type Depth = 'Quick' | 'Standard' | 'Deep';
export type Mode = 'Single' | 'Series';
export type KindleFormat = 'KFX' | 'AZW3';

export interface WizardConfig {
  voice: Voice;
  depth: Depth;
  mode: Mode;
  produceKindle: boolean;
  kindleFormat: KindleFormat;
  customFocus: string;
}

/**
 * Subset of CareerPilot's Intelligence record consumed by the assembler.
 * Field names mirror the Supabase column names returned by
 * /api/intelligence/[applicationId].
 *
 * All string fields may be empty; arrays may be empty. Empty fields are
 * silently omitted by the assembler.
 */
export interface IntelligenceSnapshot {
  company: string;
  jobTitle: string;
  applicationId: string;

  companyResearch?: {
    culture?: string;
    glassdoor?: string;
    headcount?: string;
    fundingStage?: string;
    techStack?: string[];
    whyGoodFit?: string;
    redFlags?: string;
    recentNews?: string[];
    questionsToResearch?: string[];
  };

  interviewPrep?: {
    careerNarrativeAngle?: string;
    likelyQuestions?: Array<{ question: string; answer: string }>;
    gapsToAddress?: string;
    talkingPoints?: string;
    questionsToAsk?: string;
    stageTips?: string;
  };
}

export interface PrepPackJobRequest {
  intelligence: IntelligenceSnapshot;
  config: WizardConfig;
  /** Final edited source text from the wizard's preview pane */
  sourceText: string;
}

export interface PrepPackJobResponse {
  status: 'started' | 'rejected';
  jobStem: string;
  inputPath: string;
  expectedOutputs: {
    vaultNote: string;
    mp3: string;
    kindle?: string;
  };
  /** Present only when status === 'rejected' */
  reason?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/lib/prep-pack/types.ts
git commit -m "[CAR-182] feat: add prep-pack shared types"
```

### Task A2: Naming function

**Files:**
- Create: `dashboard/src/lib/prep-pack/naming.test.ts`
- Create: `dashboard/src/lib/prep-pack/naming.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// dashboard/src/lib/prep-pack/naming.test.ts
import { describe, it, expect } from 'vitest';
import { buildJobStem, slugify } from './naming';

describe('slugify', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugify('Irving Materials')).toBe('irving_materials');
  });

  it('strips non-alphanumeric characters except underscores', () => {
    expect(slugify("O'Brien & Co.")).toBe('obrien_co');
  });

  it('replaces slashes with underscores', () => {
    expect(slugify('IT Network/Sys Admin')).toBe('it_network_sys_admin');
  });

  it('collapses runs of underscores', () => {
    expect(slugify('Foo  -  Bar')).toBe('foo_bar');
  });

  it('trims leading/trailing underscores', () => {
    expect(slugify('  Foo  ')).toBe('foo');
  });

  it('returns empty string for entirely-stripped input', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('buildJobStem', () => {
  it('produces company_title_prep_<timestamp> stem', () => {
    const ts = new Date('2026-04-25T18:30:00');
    expect(buildJobStem('Irving Materials', 'IT Network and Sys Admin', ts))
      .toBe('irving_materials_it_network_and_sys_admin_prep_2026-04-25-1830');
  });

  it('zero-pads month, day, hour, minute', () => {
    const ts = new Date('2026-01-05T03:07:00');
    expect(buildJobStem('Acme', 'Engineer', ts))
      .toBe('acme_engineer_prep_2026-01-05-0307');
  });

  it('throws if either company or jobTitle slugifies to empty', () => {
    expect(() => buildJobStem('!!!', 'Engineer', new Date()))
      .toThrow(/company.*empty/i);
    expect(() => buildJobStem('Acme', '!!!', new Date()))
      .toThrow(/jobTitle.*empty/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd dashboard && npx vitest run src/lib/prep-pack/naming.test.ts
```
Expected: All tests FAIL with "Cannot find module './naming'".

- [ ] **Step 3: Implement naming.ts**

```typescript
// dashboard/src/lib/prep-pack/naming.ts

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\/\\\s\-]+/g, '_')   // slashes, spaces, hyphens → underscore
    .replace(/[^a-z0-9_]/g, '')     // strip everything else
    .replace(/_+/g, '_')            // collapse runs
    .replace(/^_+|_+$/g, '');       // trim
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function buildJobStem(company: string, jobTitle: string, timestamp: Date): string {
  const companySlug = slugify(company);
  const titleSlug = slugify(jobTitle);
  if (!companySlug) throw new Error('Cannot build job stem: company slugified to empty');
  if (!titleSlug) throw new Error('Cannot build job stem: jobTitle slugified to empty');

  const yyyy = timestamp.getFullYear();
  const mm = pad2(timestamp.getMonth() + 1);
  const dd = pad2(timestamp.getDate());
  const hh = pad2(timestamp.getHours());
  const mi = pad2(timestamp.getMinutes());

  return `${companySlug}_${titleSlug}_prep_${yyyy}-${mm}-${dd}-${hh}${mi}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && npx vitest run src/lib/prep-pack/naming.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/prep-pack/naming.ts dashboard/src/lib/prep-pack/naming.test.ts
git commit -m "[CAR-182] feat: add naming module for prep-pack file stems"
```

### Task A3: Source-text assembler

**Files:**
- Create: `dashboard/src/lib/prep-pack/assemble-source.test.ts`
- Create: `dashboard/src/lib/prep-pack/assemble-source.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// dashboard/src/lib/prep-pack/assemble-source.test.ts
import { describe, it, expect } from 'vitest';
import { assembleSource } from './assemble-source';
import type { IntelligenceSnapshot } from './types';

const fullIntel: IntelligenceSnapshot = {
  company: 'Irving Materials',
  jobTitle: 'IT Network and Sys Admin',
  applicationId: 'abc-123',
  companyResearch: {
    culture: 'Building long-lasting relationships and safety.',
    glassdoor: '3.4/5 (54 reviews)',
    headcount: '2,200',
    fundingStage: 'Privately held; $500M-$1B revenue',
    techStack: ['SolarWinds', 'VMware', 'Nimble SAN', 'Active Directory'],
    whyGoodFit: 'Joe\'s 20+ years of enterprise IT experience aligns with...',
    redFlags: 'Some Glassdoor reviews mention nepotism concerns.',
    recentNews: ['Engineering Aggregates acquisition Feb 2025', 'Hiring expansion'],
    questionsToResearch: ['ERP timeline?', 'Google Workspace adoption status?'],
  },
  interviewPrep: {
    careerNarrativeAngle: 'My 20-year progression represents deliberate evolution...',
    likelyQuestions: [
      { question: 'Walk me through standardizing 175 servers.', answer: 'Reference Venable VMware experience...' },
      { question: 'Automate VM provisioning with PowerShell.', answer: 'Draw on PowerCLI experience...' },
    ],
    gapsToAddress: 'Limited Splunk dashboard experience compared to their needs.',
    talkingPoints: 'Lead with PowerShell automation portfolio.',
    questionsToAsk: 'What does success look like in the first 90 days?',
    stageTips: 'Bring printed PowerShell module example.',
  },
};

describe('assembleSource', () => {
  it('places Custom Focus first as ### Instructions block when non-empty', () => {
    const result = assembleSource(fullIntel, 'Lean heavy on SCCM');
    const lines = result.split('\n');
    expect(lines[0]).toBe('### Instructions');
    expect(lines[1]).toBe('Lean heavy on SCCM');
    // The first H1 should follow the instruction block
    expect(result).toMatch(/^### Instructions[\s\S]+?\n# Irving Materials/);
  });

  it('omits the ### Instructions block entirely when customFocus is empty', () => {
    const result = assembleSource(fullIntel, '');
    expect(result).not.toContain('### Instructions');
    expect(result.startsWith('# Irving Materials')).toBe(true);
  });

  it('emits sections in canonical order', () => {
    const result = assembleSource(fullIntel, '');
    const sections = [
      '## Career Narrative Angle',
      '## Why This Role Fits',
      '## Company Snapshot',
      '## Tech Stack',
      '## Recent News',
      '## Red Flags to Be Aware Of',
      '## Likely Interview Questions',
      '## Gaps to Address',
      '## Talking Points',
      '## Questions to Ask Them',
      '## Questions to Research Before the Interview',
      '## Stage Tips',
    ];
    let lastIdx = -1;
    for (const heading of sections) {
      const idx = result.indexOf(heading);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('renders likely-question entries as ### subheadings with answers', () => {
    const result = assembleSource(fullIntel, '');
    expect(result).toContain('### Walk me through standardizing 175 servers.');
    expect(result).toContain('Reference Venable VMware experience...');
    expect(result).toContain('### Automate VM provisioning with PowerShell.');
  });

  it('omits Red Flags section entirely when empty', () => {
    const intel: IntelligenceSnapshot = {
      ...fullIntel,
      companyResearch: { ...fullIntel.companyResearch, redFlags: '' },
    };
    const result = assembleSource(intel, '');
    expect(result).not.toContain('## Red Flags');
  });

  it('omits Likely Interview Questions when array is empty', () => {
    const intel: IntelligenceSnapshot = {
      ...fullIntel,
      interviewPrep: { ...fullIntel.interviewPrep, likelyQuestions: [] },
    };
    const result = assembleSource(intel, '');
    expect(result).not.toContain('## Likely Interview Questions');
  });

  it('omits Tech Stack when techStack array is empty or undefined', () => {
    const intel: IntelligenceSnapshot = {
      ...fullIntel,
      companyResearch: { ...fullIntel.companyResearch, techStack: [] },
    };
    expect(assembleSource(intel, '')).not.toContain('## Tech Stack');
  });

  it('renders Tech Stack as bullet list', () => {
    const result = assembleSource(fullIntel, '');
    expect(result).toContain('- SolarWinds');
    expect(result).toContain('- VMware');
    expect(result).toContain('- Nimble SAN');
  });

  it('renders Company Snapshot as labeled bullets, omitting any empty subfield', () => {
    const intel: IntelligenceSnapshot = {
      ...fullIntel,
      companyResearch: {
        ...fullIntel.companyResearch,
        glassdoor: '',
        fundingStage: undefined,
      },
    };
    const result = assembleSource(intel, '');
    expect(result).toContain('- Culture: Building long-lasting relationships');
    expect(result).toContain('- Headcount: 2,200');
    expect(result).not.toContain('- Glassdoor:');
    expect(result).not.toContain('- Funding / Stage:');
  });

  it('produces a top-line H1 with company and job title', () => {
    const result = assembleSource(fullIntel, '');
    expect(result).toContain('# Irving Materials — IT Network and Sys Admin — Interview Prep');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd dashboard && npx vitest run src/lib/prep-pack/assemble-source.test.ts
```
Expected: All tests FAIL with "Cannot find module './assemble-source'".

- [ ] **Step 3: Implement assemble-source.ts**

```typescript
// dashboard/src/lib/prep-pack/assemble-source.ts
import type { IntelligenceSnapshot } from './types';

function nonEmpty(s: string | undefined | null): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function bulletList(items: string[] | undefined): string {
  if (!items || items.length === 0) return '';
  return items.map((x) => `- ${x}`).join('\n');
}

export function assembleSource(intel: IntelligenceSnapshot, customFocus: string): string {
  const sections: string[] = [];

  // Custom Focus → ### Instructions block (only when non-empty).
  // SB-Autobook parses this block at the head of the source file and forwards
  // it to the planner as authoritative emphasis/exclusion guidance.
  // See AutobookCmdlets.ps1:735–747.
  if (nonEmpty(customFocus)) {
    sections.push(`### Instructions\n${customFocus.trim()}`);
  }

  sections.push(`# ${intel.company} — ${intel.jobTitle} — Interview Prep`);

  const cr = intel.companyResearch ?? {};
  const ip = intel.interviewPrep ?? {};

  if (nonEmpty(ip.careerNarrativeAngle)) {
    sections.push(`## Career Narrative Angle\n${ip.careerNarrativeAngle.trim()}`);
  }

  if (nonEmpty(cr.whyGoodFit)) {
    sections.push(`## Why This Role Fits\n${cr.whyGoodFit.trim()}`);
  }

  // Company Snapshot — only include if at least one subfield is present
  const snapshotBullets: string[] = [];
  if (nonEmpty(cr.culture))      snapshotBullets.push(`- Culture: ${cr.culture.trim()}`);
  if (nonEmpty(cr.headcount))    snapshotBullets.push(`- Headcount: ${cr.headcount.trim()}`);
  if (nonEmpty(cr.fundingStage)) snapshotBullets.push(`- Funding / Stage: ${cr.fundingStage.trim()}`);
  if (nonEmpty(cr.glassdoor))    snapshotBullets.push(`- Glassdoor: ${cr.glassdoor.trim()}`);
  if (snapshotBullets.length > 0) {
    sections.push(`## Company Snapshot\n${snapshotBullets.join('\n')}`);
  }

  if (cr.techStack && cr.techStack.length > 0) {
    sections.push(`## Tech Stack\n${bulletList(cr.techStack)}`);
  }

  if (cr.recentNews && cr.recentNews.length > 0) {
    sections.push(`## Recent News\n${bulletList(cr.recentNews)}`);
  }

  if (nonEmpty(cr.redFlags)) {
    sections.push(`## Red Flags to Be Aware Of\n${cr.redFlags.trim()}`);
  }

  if (ip.likelyQuestions && ip.likelyQuestions.length > 0) {
    const blocks = ip.likelyQuestions
      .map((q) => `### ${q.question.trim()}\n${q.answer.trim()}`)
      .join('\n\n');
    sections.push(`## Likely Interview Questions\n\n${blocks}`);
  }

  if (nonEmpty(ip.gapsToAddress))   sections.push(`## Gaps to Address\n${ip.gapsToAddress.trim()}`);
  if (nonEmpty(ip.talkingPoints))   sections.push(`## Talking Points\n${ip.talkingPoints.trim()}`);
  if (nonEmpty(ip.questionsToAsk))  sections.push(`## Questions to Ask Them\n${ip.questionsToAsk.trim()}`);

  if (cr.questionsToResearch && cr.questionsToResearch.length > 0) {
    sections.push(`## Questions to Research Before the Interview\n${bulletList(cr.questionsToResearch)}`);
  }

  if (nonEmpty(ip.stageTips)) {
    sections.push(`## Stage Tips\n${ip.stageTips.trim()}`);
  }

  return sections.join('\n\n') + '\n';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && npx vitest run src/lib/prep-pack/assemble-source.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/prep-pack/assemble-source.ts dashboard/src/lib/prep-pack/assemble-source.test.ts
git commit -m "[CAR-182] feat: add prep-pack source assembler"
```

---

### Task A4: Adapter — bridge real data shape to assembler input

The `useIntelligence` hook returns `{ brief: CompanyBriefRow | null, preps: InterviewPrepRow[], debriefs: DebriefRow[], skillMentions: SkillMentionRow[] }`, where `brief.brief_data` and `prep.prep_data` are loosely-typed JSON blobs (`Record<string, unknown>`) populated by `lib/intelligence/generators/interview-prep.ts`. The assembler expects a flat `IntelligenceSnapshot`. This task writes the adapter and locks down its contract with fixture-based tests.

**Files:**
- Create: `dashboard/src/lib/prep-pack/adapter.test.ts`
- Create: `dashboard/src/lib/prep-pack/adapter.ts`

- [ ] **Step 1: Establish field-name ground truth (DEVIATION FROM ORIGINAL PLAN)**

The original plan called for capturing a real Supabase fixture. During execution, the orchestrator discovered that `.env.local` only contains `NEXT_PUBLIC_SUPABASE_ANON_KEY` (RLS-bound, no usable session) and no `SUPABASE_SERVICE_ROLE_KEY`. Capturing a live fixture would require credentials we don't have in scope.

**Substituted with stronger ground truth:** read the generator source files. The Intelligence JSON blobs are *produced* by:
- `dashboard/src/lib/intelligence/generators/company-brief.ts` lines 7-18 → `CompanyBriefData`
- `dashboard/src/lib/intelligence/generators/interview-prep.ts` lines 7-24 → `InterviewPrepData`

These are the canonical schema definitions; live data is just snapshots of what they produce. Reading source > capturing one row. **Field names confirmed during Task A3.5 schema correction; see commit `1432b93`.**

Skip the live-fixture capture. Synthetic test fixtures in `adapter.test.ts` are derived directly from the generator types.

- [ ] **Step 2: Inspect the fixture and identify the field names**

Read `__fixtures__/irving-materials.json` and document the keys you find inside `brief.brief_data` and each `prep.prep_data`. Examples of likely keys based on the screenshot:
- `brief_data` may contain: `culture`, `glassdoor_summary`, `headcount`, `funding_stage`, `tech_stack`, `why_youre_a_good_fit`, `red_flags`, `recent_news`, `questions_to_research`
- `prep_data` may contain: `career_narrative_angle`, `likely_questions` (array of `{question, answer}`), `gaps_to_address`, `talking_points`, `questions_to_ask`, `stage_tips`

If the actual keys differ, adjust both the test and the implementation accordingly. **The fixture is authoritative.**

- [ ] **Step 3: Write failing adapter tests**

```typescript
// dashboard/src/lib/prep-pack/adapter.test.ts
import { describe, it, expect } from 'vitest';
import { toIntelligenceSnapshot } from './adapter';
import type { Application } from '@/types';
import type { CompanyBriefRow, InterviewPrepRow } from '@/lib/intelligence/supabase-helpers';

const application = {
  id: 'abc-123',
  title: 'IT Network and Sys Admin',
  company: 'Irving Materials',
} as Application;

const brief: CompanyBriefRow = {
  id: 'brief-1',
  application_id: 'abc-123',
  user_id: 'user-1',
  company_name: 'Irving Materials',
  brief_data: {
    culture: 'Building long-lasting relationships and safety.',
    glassdoor_summary: '3.4/5 (54 reviews)',
    headcount: '2,200',
    funding_stage: 'Privately held',
    tech_stack: ['SolarWinds', 'VMware', 'Nimble SAN'],
    why_youre_a_good_fit: 'Joe\'s 20+ years align with their needs',
    red_flags: 'Some Glassdoor reviews mention nepotism',
    recent_news: ['Engineering Aggregates acquisition Feb 2025'],
    questions_to_research: ['ERP timeline?'],
  },
  generated_at: '2026-04-20T00:00:00Z',
  model_used: 'claude-haiku-4-5',
  generation_cost_cents: 6,
  created_at: '2026-04-20T00:00:00Z',
};

const prepPhone: InterviewPrepRow = {
  id: 'prep-1',
  application_id: 'abc-123',
  user_id: 'user-1',
  stage: 'phone_screen',
  prep_data: {
    career_narrative_angle: 'Phone-screen narrative',
    likely_questions: [{ question: 'Tell me about yourself', answer: '...' }],
    gaps_to_address: 'Phone gaps',
    talking_points: 'Phone TPs',
    questions_to_ask: 'Phone Qs',
    stage_tips: 'Phone tips',
  },
  generated_at: '2026-04-20T00:00:00Z',
  model_used: 'claude-haiku-4-5',
  generation_cost_cents: 8,
  created_at: '2026-04-20T00:00:00Z',
};

const prepTechnical: InterviewPrepRow = {
  ...prepPhone,
  id: 'prep-2',
  stage: 'technical',
  prep_data: {
    career_narrative_angle: 'Technical narrative — most recent',
    likely_questions: [
      { question: 'Walk me through standardizing 175 servers', answer: 'Reference Venable...' },
    ],
    gaps_to_address: 'Tech gaps',
    talking_points: 'Tech TPs',
    questions_to_ask: 'Tech Qs',
    stage_tips: 'Tech tips',
  },
  generated_at: '2026-04-21T00:00:00Z',  // newer
};

describe('toIntelligenceSnapshot', () => {
  it('extracts company and jobTitle from application.company and application.title', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [] });
    expect(snap.company).toBe('Irving Materials');
    expect(snap.jobTitle).toBe('IT Network and Sys Admin');
    expect(snap.applicationId).toBe('abc-123');
  });

  it('maps brief_data fields into companyResearch', () => {
    const snap = toIntelligenceSnapshot(application, { brief, preps: [] });
    expect(snap.companyResearch?.culture).toBe('Building long-lasting relationships and safety.');
    expect(snap.companyResearch?.glassdoor).toBe('3.4/5 (54 reviews)');
    expect(snap.companyResearch?.headcount).toBe('2,200');
    expect(snap.companyResearch?.fundingStage).toBe('Privately held');
    expect(snap.companyResearch?.techStack).toEqual(['SolarWinds', 'VMware', 'Nimble SAN']);
    expect(snap.companyResearch?.whyGoodFit).toBe('Joe\'s 20+ years align with their needs');
    expect(snap.companyResearch?.redFlags).toBe('Some Glassdoor reviews mention nepotism');
    expect(snap.companyResearch?.recentNews).toEqual(['Engineering Aggregates acquisition Feb 2025']);
    expect(snap.companyResearch?.questionsToResearch).toEqual(['ERP timeline?']);
  });

  it('returns undefined companyResearch when brief is null', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [] });
    expect(snap.companyResearch).toBeUndefined();
  });

  it('uses the most recent prep (max generated_at) when multiple stages exist', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [prepPhone, prepTechnical] });
    expect(snap.interviewPrep?.careerNarrativeAngle).toBe('Technical narrative — most recent');
    expect(snap.interviewPrep?.likelyQuestions?.[0].question)
      .toBe('Walk me through standardizing 175 servers');
  });

  it('returns undefined interviewPrep when preps array is empty', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [] });
    expect(snap.interviewPrep).toBeUndefined();
  });

  it('tolerates missing keys inside brief_data without throwing', () => {
    const sparseBrief: CompanyBriefRow = {
      ...brief,
      brief_data: { culture: 'Just culture', tech_stack: [] },
    };
    const snap = toIntelligenceSnapshot(application, { brief: sparseBrief, preps: [] });
    expect(snap.companyResearch?.culture).toBe('Just culture');
    expect(snap.companyResearch?.glassdoor).toBeUndefined();
    expect(snap.companyResearch?.techStack).toEqual([]);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd dashboard && npx vitest run src/lib/prep-pack/adapter.test.ts
```
Expected: FAIL — module './adapter' not found.

- [ ] **Step 5: Implement adapter.ts**

```typescript
// dashboard/src/lib/prep-pack/adapter.ts
import type { Application } from '@/types';
import type { CompanyBriefRow, InterviewPrepRow } from '@/lib/intelligence/supabase-helpers';
import type { IntelligenceSnapshot } from './types';

interface AdapterInput {
  brief: CompanyBriefRow | null;
  preps: InterviewPrepRow[];
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const v = obj[key];
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') out.push(item);
  }
  return out;
}

function getQAArray(obj: Record<string, unknown>, key: string): Array<{ question: string; answer: string }> | undefined {
  const v = obj[key];
  if (!Array.isArray(v)) return undefined;
  const out: Array<{ question: string; answer: string }> = [];
  for (const item of v) {
    if (item && typeof item === 'object' && 'question' in item && 'answer' in item) {
      const q = (item as Record<string, unknown>).question;
      const a = (item as Record<string, unknown>).answer;
      if (typeof q === 'string' && typeof a === 'string') {
        out.push({ question: q, answer: a });
      }
    }
  }
  return out;
}

export function toIntelligenceSnapshot(
  application: Application,
  data: AdapterInput,
): IntelligenceSnapshot {
  const snap: IntelligenceSnapshot = {
    company: application.company,
    jobTitle: application.title,
    applicationId: application.id,
  };

  if (data.brief) {
    const b = data.brief.brief_data;
    snap.companyResearch = {
      culture: getString(b, 'culture'),
      glassdoor: getString(b, 'glassdoor_summary'),
      headcount: getString(b, 'headcount'),
      fundingStage: getString(b, 'funding_stage'),
      techStack: getStringArray(b, 'tech_stack'),
      whyGoodFit: getString(b, 'why_youre_a_good_fit'),
      redFlags: getString(b, 'red_flags'),
      recentNews: getStringArray(b, 'recent_news'),
      questionsToResearch: getStringArray(b, 'questions_to_research'),
    };
  }

  if (data.preps.length > 0) {
    // Pick the most recent prep across all stages.
    const latest = [...data.preps].sort(
      (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
    )[0];
    const p = latest.prep_data;
    snap.interviewPrep = {
      careerNarrativeAngle: getString(p, 'career_narrative_angle'),
      likelyQuestions: getQAArray(p, 'likely_questions'),
      gapsToAddress: getString(p, 'gaps_to_address'),
      talkingPoints: getString(p, 'talking_points'),
      questionsToAsk: getString(p, 'questions_to_ask'),
      stageTips: getString(p, 'stage_tips'),
    };
  }

  return snap;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd dashboard && npx vitest run src/lib/prep-pack/adapter.test.ts
```
Expected: All tests PASS. **If tests fail because the fixture's actual key names differ from the assumed names** (e.g., `glassdoor` vs. `glassdoor_summary`), update both the test fixtures AND the adapter implementation to match the real keys. The fixture is authoritative.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/lib/prep-pack/adapter.ts dashboard/src/lib/prep-pack/adapter.test.ts dashboard/src/lib/prep-pack/__fixtures__/
git commit -m "[CAR-182] feat: add intelligence-data → snapshot adapter"
```

---

## Stream B: PowerShell wrapper script

This stream is independent of the Next.js code and can be done in parallel with Streams A/D.

### Task B1: Wrapper script with Pester tests

**Files:**
- Create: `dashboard/tools/run-prep-pack.ps1`
- Create: `dashboard/tools/run-prep-pack.Tests.ps1`

- [ ] **Step 1: Write Pester tests first**

```powershell
# dashboard/tools/run-prep-pack.Tests.ps1
# Run with: pwsh -Command "Invoke-Pester -Path .\tools\run-prep-pack.Tests.ps1 -Output Detailed"

BeforeAll {
    $ScriptUnderTest = Join-Path $PSScriptRoot 'run-prep-pack.ps1'
}

Describe 'run-prep-pack.ps1 parameter contract' {
    It 'fails fast when -InputFile is missing' {
        { & $ScriptUnderTest -Voice Steffan -Depth Standard -Mode Single } |
            Should -Throw -ErrorId 'ParameterArgumentValidationError*'
    }

    It 'fails fast when -InputFile does not exist' {
        $bogus = Join-Path $env:TEMP "nonexistent-$(Get-Random).txt"
        { & $ScriptUnderTest -InputFile $bogus -Voice Steffan -Depth Standard -Mode Single } |
            Should -Throw -ExpectedMessage '*not found*'
    }

    It 'rejects an invalid -Voice value' {
        $tmp = New-TemporaryFile
        try {
            { & $ScriptUnderTest -InputFile $tmp.FullName -Voice Banana -Depth Standard -Mode Single } |
                Should -Throw
        } finally {
            Remove-Item $tmp -ErrorAction SilentlyContinue
        }
    }

    It 'rejects an invalid -Mode value' {
        $tmp = New-TemporaryFile
        try {
            { & $ScriptUnderTest -InputFile $tmp.FullName -Voice Steffan -Depth Standard -Mode Quintet } |
                Should -Throw
        } finally {
            Remove-Item $tmp -ErrorAction SilentlyContinue
        }
    }
}

Describe 'run-prep-pack.ps1 maps wizard config to Invoke-SBAutobook arguments' -Tag 'Mock' {
    BeforeEach {
        # Mock Invoke-SBAutobook so we can assert how it gets called without
        # running the real pipeline.
        Mock -CommandName Invoke-SBAutobook -MockWith { return [PSCustomObject]@{ Success = $true } }
        Mock -CommandName Send-PrepPackDiscord -MockWith { } -ModuleName 'run-prep-pack'
    }

    It 'translates Mode=Single to -Structure Single' {
        $tmp = New-TemporaryFile
        try {
            & $ScriptUnderTest -InputFile $tmp.FullName -Voice Steffan -Depth Standard -Mode Single
            Assert-MockCalled Invoke-SBAutobook -ParameterFilter { $Structure -eq 'Single' }
        } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
    }

    It 'translates Mode=Series to -Structure Auto' {
        $tmp = New-TemporaryFile
        try {
            & $ScriptUnderTest -InputFile $tmp.FullName -Voice Steffan -Depth Standard -Mode Series
            Assert-MockCalled Invoke-SBAutobook -ParameterFilter { $Structure -eq 'Auto' }
        } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
    }

    It 'passes -ProduceKindle when -ProduceKindle switch is set' {
        $tmp = New-TemporaryFile
        try {
            & $ScriptUnderTest -InputFile $tmp.FullName -Voice Steffan -Depth Standard -Mode Single -ProduceKindle
            Assert-MockCalled Invoke-SBAutobook -ParameterFilter { $ProduceKindle -eq $true }
        } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
    }

    It 'omits -ProduceKindle when switch not set' {
        $tmp = New-TemporaryFile
        try {
            & $ScriptUnderTest -InputFile $tmp.FullName -Voice Steffan -Depth Standard -Mode Single
            Assert-MockCalled Invoke-SBAutobook -ParameterFilter { -not $PSBoundParameters.ContainsKey('ProduceKindle') }
        } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
    }

    It 'derives -OutputPrefix from input file basename' {
        $tmp = Join-Path $env:TEMP 'irving_materials_it_network_prep_2026-04-25-1830.txt'
        Set-Content -Path $tmp -Value 'test' -Encoding UTF8
        try {
            & $ScriptUnderTest -InputFile $tmp -Voice Steffan -Depth Standard -Mode Single
            Assert-MockCalled Invoke-SBAutobook -ParameterFilter {
                $OutputPrefix -eq 'irving_materials_it_network_prep_2026-04-25-1830'
            }
        } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pwsh -NoProfile -Command "Invoke-Pester -Path dashboard/tools/run-prep-pack.Tests.ps1 -Output Detailed"
```
Expected: FAIL — script does not exist.

- [ ] **Step 3: Write the wrapper script**

```powershell
# dashboard/tools/run-prep-pack.ps1
<#
.SYNOPSIS
    Wraps Invoke-SBAutobook for the CareerPilot Prep Pack pipeline. Posts a
    Discord webhook on completion or failure.

.DESCRIPTION
    Translates wizard-supplied parameters into the cmdlet's parameter set,
    runs the full pipeline, inspects the output directories to determine
    actual artifacts produced (defends against silent KFX→AZW3 fallback
    in EbookAutomation's Convert-ToKindle), then POSTs a Discord webhook.

    Designed to be invoked detached from the Next.js API route via
    child_process.spawn. All logging goes to a per-job transcript file
    in $env:LOCALAPPDATA\CareerPilot\prep-pack\logs\<stem>.log.

.PARAMETER InputFile
    Absolute path to the assembled source .txt in the SecondBrain Inbox.

.PARAMETER Voice
    SAPI voice for TTS. One of: Steffan, Aria, Jenny, Guy.

.PARAMETER Depth
    SB-Autobook depth profile. One of: Quick, Standard, Deep.

.PARAMETER Mode
    Single = one book; Series = let SB-Autobook plan a 3-book split.

.PARAMETER ProduceKindle
    If set, also produces a Kindle ebook via ConvertTo-SBAutobookKindle.

.PARAMETER KindleFormat
    KFX (default) or AZW3. Drives EbookAutomation's output_format config.
    Ignored unless -ProduceKindle is also set.

.PARAMETER DiscordWebhookUrl
    Required. Discord-relay URL the route handler passes through. Caller
    is responsible for ensuring this is a valid relay URL.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ if (-not (Test-Path $_)) { throw "Input file not found: $_" } else { $true } })]
    [string]$InputFile,

    [Parameter(Mandatory)]
    [ValidateSet('Steffan', 'Aria', 'Jenny', 'Guy')]
    [string]$Voice,

    [Parameter(Mandatory)]
    [ValidateSet('Quick', 'Standard', 'Deep')]
    [string]$Depth,

    [Parameter(Mandatory)]
    [ValidateSet('Single', 'Series')]
    [string]$Mode,

    [switch]$ProduceKindle,

    [ValidateSet('KFX', 'AZW3')]
    [string]$KindleFormat = 'KFX',

    [string]$DiscordWebhookUrl
)

$ErrorActionPreference = 'Stop'

$jobStem = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)
$logDir  = Join-Path $env:LOCALAPPDATA 'CareerPilot\prep-pack\logs'
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logPath = Join-Path $logDir "$jobStem.log"

Start-Transcript -Path $logPath -Append | Out-Null

$startTime = Get-Date
$structure = if ($Mode -eq 'Series') { 'Auto' } else { 'Single' }

# --- Apply EbookAutomation config override for kindle format ---
# The cmdlet reads $cfg.kindle.output_format from EbookAutomation/config.
# We set an env var that EbookAutomation's Get-EbookConfig respects.
if ($ProduceKindle) {
    $env:EBOOKAUTOMATION_KINDLE_FORMAT = $KindleFormat.ToLower()
}

try {
    # Load SecondBrain module (sets up Invoke-SBAutobook in the session).
    $sbModule = 'F:\Obsidian\SecondBrain\Resources\SB-PSModules\SecondBrain.psd1'
    if (Test-Path $sbModule) {
        Import-Module $sbModule -ErrorAction Stop
    } else {
        throw "SecondBrain module not found at $sbModule"
    }

    $invokeArgs = @{
        FromFile  = $InputFile
        Structure = $structure
        Voice     = $Voice
        Depth     = $Depth
        OutputPrefix = $jobStem
    }
    if ($ProduceKindle) { $invokeArgs.ProduceKindle = $true }

    $result = Invoke-SBAutobook @invokeArgs
    $exitCode = 0
    $errorTail = $null
}
catch {
    $exitCode = 1
    $errorTail = $_ | Out-String
    Write-Error $errorTail
}
finally {
    $duration = (Get-Date) - $startTime

    # --- Inspect actual artifacts produced ---
    $artifacts = @{
        Mp3        = $null
        VaultNote  = $null
        KindleFile = $null
        KindleFormat = $null  # actual format, may differ from requested if KFX failed
    }

    $audioDir = 'F:\Projects\EbookAutomation\output\audiobooks'
    if (Test-Path $audioDir) {
        $mp3 = Get-ChildItem $audioDir -Filter "*$jobStem*.mp3" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($mp3) { $artifacts.Mp3 = $mp3.FullName }
    }

    $vaultDir = 'F:\Obsidian\SecondBrain\Learning\Audiobooks'
    if (Test-Path $vaultDir) {
        $note = Get-ChildItem $vaultDir -Filter "*$jobStem*.md" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($note) { $artifacts.VaultNote = $note.FullName }
    }

    if ($ProduceKindle) {
        $kindleDir = 'F:\Projects\EbookAutomation\output\kindle'
        if (Test-Path $kindleDir) {
            $kindle = Get-ChildItem $kindleDir -Filter "*$jobStem*" -ErrorAction SilentlyContinue |
                Where-Object { $_.Extension -in @('.kfx', '.azw3') } |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($kindle) {
                $artifacts.KindleFile   = $kindle.FullName
                $artifacts.KindleFormat = $kindle.Extension.TrimStart('.').ToUpper()
            }
        }
    }

    # --- Post Discord notification ---
    if ($DiscordWebhookUrl) {
        $title = if ($exitCode -eq 0) {
            "Prep Pack ready: $jobStem"
        } else {
            "Prep Pack FAILED: $jobStem"
        }

        $body = if ($exitCode -eq 0) {
            $kindleNote = if ($ProduceKindle -and $artifacts.KindleFormat) {
                if ($artifacts.KindleFormat -ne $KindleFormat) {
                    "[OK] Kindle: $($artifacts.KindleFormat) (requested $KindleFormat — fallback)"
                } else {
                    "[OK] Kindle: $($artifacts.KindleFormat)"
                }
            } elseif ($ProduceKindle) {
                "[FAIL] Kindle: requested $KindleFormat, none produced"
            } else { "" }

            @"
Runtime: $('{0:mm\:ss}' -f $duration)
[OK] MP3: $(if ($artifacts.Mp3) { Split-Path $artifacts.Mp3 -Leaf } else { 'NOT FOUND' })
[OK] Vault note: $(if ($artifacts.VaultNote) { Split-Path $artifacts.VaultNote -Leaf } else { 'NOT FOUND' })
$kindleNote
Stem: ``$jobStem``
"@
        } else {
            $tail = if ($errorTail) {
                ($errorTail -split "`n" | Select-Object -Last 30) -join "`n"
            } else { 'No transcript captured' }

            @"
Exit code: $exitCode
Last 30 lines:
``````
$tail
``````
Full log: $logPath
"@
        }

        try {
            $payload = @{
                title  = $title
                body   = $body
                status = if ($exitCode -eq 0) { 'success' } else { 'failure' }
            } | ConvertTo-Json -Compress

            Invoke-RestMethod -Uri $DiscordWebhookUrl -Method Post -Body $payload `
                -ContentType 'application/json' -ErrorAction Stop | Out-Null
        }
        catch {
            Write-Warning "Discord webhook failed: $_"
        }
    }

    Stop-Transcript | Out-Null
    exit $exitCode
}
```

- [ ] **Step 4: Run Pester tests**

```bash
pwsh -NoProfile -Command "Invoke-Pester -Path dashboard/tools/run-prep-pack.Tests.ps1 -Output Detailed"
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/tools/run-prep-pack.ps1 dashboard/tools/run-prep-pack.Tests.ps1
git commit -m "[CAR-182] feat: add run-prep-pack pwsh wrapper with Pester tests"
```

---

## Stream C: Backend route

Depends on Stream A (types, naming, assembler) and Stream B (the wrapper script must exist for the route to invoke).

### Task C1: POST /api/prep-pack route with mocked subprocess

**Files:**
- Create: `dashboard/src/app/api/prep-pack/route.ts`
- Create: `dashboard/src/app/api/prep-pack/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// dashboard/src/app/api/prep-pack/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrepPackJobRequest } from '@/lib/prep-pack/types';

// Mock child_process and fs/promises before importing the route handler.
const spawnMock = vi.fn();
const writeFileMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    // Return a minimal ChildProcess stub. The route uses unref() to detach.
    return {
      unref: vi.fn(),
      on: vi.fn(),
      pid: 42,
    };
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    writeFile: (...args: unknown[]) => writeFileMock(...args),
    mkdir:     (...args: unknown[]) => mkdirMock(...args),
  },
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  mkdir:     (...args: unknown[]) => mkdirMock(...args),
}));

import { POST } from './route';

const minimalReq: PrepPackJobRequest = {
  intelligence: {
    company: 'Irving Materials',
    jobTitle: 'IT Network and Sys Admin',
    applicationId: 'abc-123',
  },
  config: {
    voice: 'Steffan',
    depth: 'Standard',
    mode: 'Single',
    produceKindle: true,
    kindleFormat: 'KFX',
    customFocus: '',
  },
  sourceText: '# Test source\n\nBody text.',
};

beforeEach(() => {
  spawnMock.mockClear();
  writeFileMock.mockClear();
  mkdirMock.mockClear();
});

describe('POST /api/prep-pack', () => {
  it('returns 202 with the planned job stem and expected output paths', async () => {
    const req = new Request('http://localhost/api/prep-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalReq),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const body = await res.json();
    expect(body.status).toBe('started');
    expect(body.jobStem).toMatch(/^irving_materials_it_network_and_sys_admin_prep_\d{4}-\d{2}-\d{2}-\d{4}$/);
    expect(body.inputPath).toContain('Inbox');
    expect(body.expectedOutputs.mp3).toContain('audiobooks');
    expect(body.expectedOutputs.vaultNote).toContain('Audiobooks');
    expect(body.expectedOutputs.kindle).toBeDefined();
  });

  it('writes the source text to the Inbox path', async () => {
    const req = new Request('http://localhost/api/prep-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalReq),
    });
    await POST(req);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [path, content] = writeFileMock.mock.calls[0];
    expect(path).toMatch(/Inbox.*\.txt$/);
    expect(content).toBe('# Test source\n\nBody text.');
  });

  it('spawns pwsh with the wrapper script and the wizard arguments', async () => {
    const req = new Request('http://localhost/api/prep-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalReq),
    });
    await POST(req);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnMock.mock.calls[0];
    expect(cmd).toBe('pwsh');
    expect(args).toContain('-NoProfile');
    expect(args).toContain('-File');
    expect(args.find((a: string) => a.endsWith('run-prep-pack.ps1'))).toBeDefined();
    expect(args).toContain('-Voice'); expect(args).toContain('Steffan');
    expect(args).toContain('-Depth'); expect(args).toContain('Standard');
    expect(args).toContain('-Mode');  expect(args).toContain('Single');
    expect(args).toContain('-ProduceKindle');
    expect(args).toContain('-KindleFormat'); expect(args).toContain('KFX');
    // Detached + ignored stdio so the Node parent can exit
    expect(opts.detached).toBe(true);
    expect(opts.stdio).toBe('ignore');
  });

  it('omits -ProduceKindle and -KindleFormat when produceKindle=false', async () => {
    const r: PrepPackJobRequest = {
      ...minimalReq,
      config: { ...minimalReq.config, produceKindle: false },
    };
    const req = new Request('http://localhost/api/prep-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    });
    await POST(req);
    const [, args] = spawnMock.mock.calls[0];
    expect(args).not.toContain('-ProduceKindle');
    expect(args).not.toContain('-KindleFormat');
  });

  it('returns 400 when intelligence.company is missing', async () => {
    const r = { ...minimalReq, intelligence: { ...minimalReq.intelligence, company: '' } };
    const req = new Request('http://localhost/api/prep-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 400 when sourceText is empty', async () => {
    const r: PrepPackJobRequest = { ...minimalReq, sourceText: '' };
    const req = new Request('http://localhost/api/prep-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd dashboard && npx vitest run src/app/api/prep-pack/route.test.ts
```
Expected: FAIL — module './route' does not exist.

- [ ] **Step 3: Implement the route**

```typescript
// dashboard/src/app/api/prep-pack/route.ts
import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { buildJobStem } from '@/lib/prep-pack/naming';
import type { PrepPackJobResponse } from '@/lib/prep-pack/types';

const VAULT_INBOX = 'F:\\Obsidian\\SecondBrain\\Inbox';
const AUDIOBOOK_OUTPUT_DIR = 'F:\\Projects\\EbookAutomation\\output\\audiobooks';
const KINDLE_OUTPUT_DIR = 'F:\\Projects\\EbookAutomation\\output\\kindle';
const VAULT_NOTE_DIR = 'F:\\Obsidian\\SecondBrain\\Learning\\Audiobooks';

// Path to the wrapper script, resolved relative to the worktree root.
// process.cwd() is the dashboard/ dir when Next.js runs; tools/ sits next to src/.
const WRAPPER_SCRIPT = path.resolve(process.cwd(), 'tools', 'run-prep-pack.ps1');
const DISCORD_RELAY_URL = process.env.DISCORD_RELAY_URL ?? 'http://localhost:3000/api/discord-relay';

const RequestSchema = z.object({
  intelligence: z.object({
    company: z.string().trim().min(1),
    jobTitle: z.string().trim().min(1),
    applicationId: z.string().trim().min(1),
    companyResearch: z.unknown().optional(),
    interviewPrep: z.unknown().optional(),
  }),
  config: z.object({
    voice: z.enum(['Steffan', 'Aria', 'Jenny', 'Guy']),
    depth: z.enum(['Quick', 'Standard', 'Deep']),
    mode: z.enum(['Single', 'Series']),
    produceKindle: z.boolean(),
    kindleFormat: z.enum(['KFX', 'AZW3']),
    customFocus: z.string(),
  }),
  sourceText: z.string().trim().min(1),
});

export async function POST(request: Request): Promise<Response> {
  let parsed;
  try {
    const body = await request.json();
    parsed = RequestSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      { status: 'rejected', reason: 'Invalid request body', details: String(err) },
      { status: 400 },
    );
  }

  const { intelligence, config, sourceText } = parsed;
  const stem = buildJobStem(intelligence.company, intelligence.jobTitle, new Date());
  const inputPath = path.join(VAULT_INBOX, `${stem}.txt`);

  try {
    await mkdir(VAULT_INBOX, { recursive: true });
    await writeFile(inputPath, sourceText, 'utf8');
  } catch (err) {
    return NextResponse.json(
      { status: 'rejected', reason: `Failed to write input file: ${String(err)}` },
      { status: 500 },
    );
  }

  // Build pwsh args. Order doesn't matter to PowerShell parameter binding.
  const args: string[] = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', WRAPPER_SCRIPT,
    '-InputFile', inputPath,
    '-Voice', config.voice,
    '-Depth', config.depth,
    '-Mode', config.mode,
    '-DiscordWebhookUrl', DISCORD_RELAY_URL,
  ];
  if (config.produceKindle) {
    args.push('-ProduceKindle');
    args.push('-KindleFormat', config.kindleFormat);
  }

  const child = spawn('pwsh', args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const expectedOutputs: PrepPackJobResponse['expectedOutputs'] = {
    vaultNote: path.join(VAULT_NOTE_DIR, `${stem}.md`),
    mp3: path.join(AUDIOBOOK_OUTPUT_DIR, `${stem}.mp3`),
  };
  if (config.produceKindle) {
    const ext = config.kindleFormat.toLowerCase();
    expectedOutputs.kindle = path.join(KINDLE_OUTPUT_DIR, `${stem}.${ext}`);
  }

  return NextResponse.json<PrepPackJobResponse>(
    {
      status: 'started',
      jobStem: stem,
      inputPath,
      expectedOutputs,
    },
    { status: 202 },
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && npx vitest run src/app/api/prep-pack/route.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/app/api/prep-pack/route.ts dashboard/src/app/api/prep-pack/route.test.ts
git commit -m "[CAR-182] feat: add /api/prep-pack route handler"
```

---

## Stream D: Wizard UI

Depends on Stream A (types, assembler).

### Task D1: Two-step wizard component

**Files:**
- Create: `dashboard/src/components/applications/prep-pack-modal.tsx`

- [ ] **Step 1: Read existing modal patterns**

Open these for reference (don't modify):
- [tailor-modal.tsx](F:\Projects\CareerPilot\dashboard\src\components\applications\tailor-modal.tsx)
- [cover-letter-modal.tsx](F:\Projects\CareerPilot\dashboard\src\components\applications\cover-letter-modal.tsx)

Note the prop shape these use (likely `{ open, onOpenChange, application }`), shadcn `Dialog` import path, and how they call their `/api/...` endpoints. Match those conventions exactly in the new file.

- [ ] **Step 2: Implement the modal**

```tsx
// dashboard/src/components/applications/prep-pack-modal.tsx
'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { assembleSource } from '@/lib/prep-pack/assemble-source';
import type { IntelligenceSnapshot, WizardConfig, PrepPackJobResponse } from '@/lib/prep-pack/types';

interface PrepPackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intelligence: IntelligenceSnapshot;
  intelligenceLoading: boolean;
}

const DEFAULT_CONFIG: WizardConfig = {
  voice: 'Steffan',
  depth: 'Standard',
  mode: 'Single',
  produceKindle: true,
  kindleFormat: 'KFX',
  customFocus: '',
};

export function PrepPackModal({ open, onOpenChange, intelligence, intelligenceLoading }: PrepPackModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [config, setConfig] = useState<WizardConfig>(DEFAULT_CONFIG);
  const [sourceText, setSourceText] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Re-assembled fresh whenever Step 1 changes; user can override in Step 2.
  const assembledPreview = useMemo(
    () => assembleSource(intelligence, config.customFocus),
    [intelligence, config.customFocus],
  );

  const goToPreview = () => {
    setSourceText(assembledPreview);
    setStep(2);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/prep-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intelligence, config, sourceText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Failed to start render: ${err.reason ?? res.statusText}`);
        return;
      }
      const data = (await res.json()) as PrepPackJobResponse;
      toast.success(`Prep Pack rendering started: ${data.jobStem}`, {
        description: `MP3 will be at ${data.expectedOutputs.mp3}. You'll get a Discord ping when it's ready.`,
        duration: 10000,
      });
      onOpenChange(false);
      // Reset for next open
      setStep(1);
      setConfig(DEFAULT_CONFIG);
      setSourceText('');
    } catch (err) {
      toast.error(`Network error: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Prep Pack — {intelligence.company} — {intelligence.jobTitle}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Configure how the audiobook + ebook should be produced.'
              : 'Review and edit the source text before rendering.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <Label>Voice</Label>
              <RadioGroup
                value={config.voice}
                onValueChange={(v) => setConfig({ ...config, voice: v as WizardConfig['voice'] })}
                className="grid grid-cols-2 gap-2 mt-2"
              >
                {(['Steffan', 'Aria', 'Jenny', 'Guy'] as const).map((v) => (
                  <div key={v} className="flex items-center space-x-2">
                    <RadioGroupItem value={v} id={`voice-${v}`} />
                    <Label htmlFor={`voice-${v}`}>{v}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label>Depth</Label>
              <RadioGroup
                value={config.depth}
                onValueChange={(v) => setConfig({ ...config, depth: v as WizardConfig['depth'] })}
                className="flex gap-4 mt-2"
              >
                {(['Quick', 'Standard', 'Deep'] as const).map((d) => (
                  <div key={d} className="flex items-center space-x-2">
                    <RadioGroupItem value={d} id={`depth-${d}`} />
                    <Label htmlFor={`depth-${d}`}>{d}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label>Mode</Label>
              <RadioGroup
                value={config.mode}
                onValueChange={(v) => setConfig({ ...config, mode: v as WizardConfig['mode'] })}
                className="flex gap-4 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Single" id="mode-single" />
                  <Label htmlFor="mode-single">Single book</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Series" id="mode-series" />
                  <Label htmlFor="mode-series">3-book series</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="kindle-toggle">Also produce a Kindle ebook</Label>
                <Switch
                  id="kindle-toggle"
                  checked={config.produceKindle}
                  onCheckedChange={(checked) => setConfig({ ...config, produceKindle: checked })}
                />
              </div>
              {config.produceKindle && (
                <RadioGroup
                  value={config.kindleFormat}
                  onValueChange={(v) => setConfig({ ...config, kindleFormat: v as WizardConfig['kindleFormat'] })}
                  className="flex gap-4 ml-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="KFX" id="fmt-kfx" />
                    <Label htmlFor="fmt-kfx">KFX (Kindle Scribe)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="AZW3" id="fmt-azw3" />
                    <Label htmlFor="fmt-azw3">AZW3 (universal Kindle)</Label>
                  </div>
                </RadioGroup>
              )}
            </div>

            <div>
              <Label htmlFor="custom-focus">Custom Focus (optional)</Label>
              <Textarea
                id="custom-focus"
                placeholder="e.g., Lean heavy on SCCM. Skip the personal background section."
                value={config.customFocus}
                onChange={(e) => setConfig({ ...config, customFocus: e.target.value })}
                className="mt-2 min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Forwarded as authoritative emphasis/exclusion guidance to SB-Autobook.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={goToPreview}>Next: Preview ▶</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Label htmlFor="source-text">Source text — edit freely before rendering</Label>
            <Textarea
              id="source-text"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              className="font-mono text-sm min-h-[400px]"
            />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                ◀ Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || sourceText.trim().length === 0}>
                {submitting ? 'Starting…' : 'Render ▶'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify shadcn components are available**

If `@/components/ui/switch`, `@/components/ui/radio-group`, or `@/components/ui/textarea` are not installed, install them:

```bash
cd dashboard && npx shadcn@latest add switch radio-group textarea
```

Verify imports resolve:

```bash
cd dashboard && npx tsc --noEmit src/components/applications/prep-pack-modal.tsx
```
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/applications/prep-pack-modal.tsx
# include any newly added shadcn ui components if present
git add dashboard/src/components/ui/ 2>/dev/null
git commit -m "[CAR-182] feat: add Prep Pack two-step wizard modal"
```

---

## Stream E: Wire button into application card

Depends on Stream D (modal exists).

### Task E1: Add Prep Pack button to application-row

**Files:**
- Modify: `dashboard/src/components/applications/application-row.tsx`

- [ ] **Step 1: Inspect the current button stack**

Read [application-row.tsx](F:\Projects\CareerPilot\dashboard\src\components\applications\application-row.tsx). The existing modals follow the `[<name>Open, set<name>Open]` pattern (`tailorOpen`, `coverLetterOpen`, `scheduleOpen`). Icons are imported from `lucide-react` (existing imports include `BrainCircuit`, `FileCheck`, `FileText`). Intelligence loads via `useIntelligence(application.id, isExpanded)` (lazy-fetch on row expansion — see file header CAR-99 comment about N+1 prevention).

- [ ] **Step 2: Add modal state and integrate the existing intelligence hook**

Update the existing `useIntelligence` destructure to also pull `data` and `loading`. The current code (line 78) is:

```tsx
const { hasData: hasIntelligence } = useIntelligence(application.id, isExpanded)
```

Change it to:

```tsx
const { hasData: hasIntelligence, data: intelligenceData, loading: intelligenceLoading } =
  useIntelligence(application.id, isExpanded || prepPackOpen)
```

Add these imports at the top of the file:

```tsx
import { Headphones } from "lucide-react"
import { PrepPackModal } from "./prep-pack-modal"
import { toIntelligenceSnapshot } from "@/lib/prep-pack/adapter"
```

Add modal state near the other `useState` declarations (after `scheduleOpen`):

```tsx
const [prepPackOpen, setPrepPackOpen] = useState(false)
```

Construct the snapshot via the adapter. Add this `useMemo` after the `useIntelligence` line:

```tsx
const prepPackSnapshot = useMemo(
  () => toIntelligenceSnapshot(application, {
    brief: intelligenceData.brief,
    preps: intelligenceData.preps,
  }),
  [application, intelligenceData.brief, intelligenceData.preps],
)

const prepPackDisabled = !intelligenceData.brief && intelligenceData.preps.length === 0
```

Add `useMemo` to the React imports at the top:

```tsx
import { useState, useEffect, useMemo } from "react"
```

- [ ] **Step 3: Add the button next to Cover Letter and Delete**

Locate the existing button stack. Add the Prep Pack button immediately after the Cover Letter button:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setPrepPackOpen(true)}
  disabled={prepPackDisabled}
  title={prepPackDisabled ? "Fill in Company Research or Interview Prep first" : "Generate audiobook + Kindle ebook"}
>
  <Headphones className="w-4 h-4 mr-2" />
  Prep Pack
</Button>
```

Match the variant/size used by the surrounding buttons (Tailor, Cover Letter) — adjust if those differ from `outline`/`sm`.

- [ ] **Step 4: Render the modal alongside the others**

At the end of the component's JSX (where `TailorModal`, `CoverLetterModal`, and `ScheduleModal` are rendered), add:

```tsx
<PrepPackModal
  open={prepPackOpen}
  onOpenChange={setPrepPackOpen}
  intelligence={prepPackSnapshot}
  intelligenceLoading={intelligenceLoading}
/>
```

- [ ] **Step 3: Type-check**

```bash
cd dashboard && npx tsc --noEmit
```
Expected: no errors. If property names like `application.intelligence` don't match, fix the snapshot construction to match the actual application type from the file.

- [ ] **Step 4: Smoke-test in dev**

```bash
cd dashboard && npm run dev
```

In the browser:
1. Open an application that has Intelligence filled in (Irving Materials per the test target).
2. Confirm the Prep Pack button appears.
3. Click it — wizard opens at Step 1 with default values.
4. Click Next — Step 2 shows the assembled source.
5. Click Back, change Voice/Depth/Custom Focus.
6. Click Next again — assembled preview reflects the new Custom Focus at the top as `### Instructions`.
7. Cancel the dialog. Open an application with NO Intelligence — confirm the button is disabled with the tooltip.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/applications/application-row.tsx
git commit -m "[CAR-182] feat: add Prep Pack button to application card"
```

---

## Stream F: End-to-end verification + cross-project registration

Depends on all prior streams.

### Task F1: Run feature against the Irving Materials test target

**Files:** none (manual verification)

- [ ] **Step 1: Confirm prerequisites**

```bash
pwsh -NoProfile -Command "Get-Command Invoke-SBAutobook -ErrorAction SilentlyContinue | Select-Object Name, ModuleName"
```
Expected: returns `Invoke-SBAutobook   SecondBrain`. If not, the SB module is not installed in the user's PS path; investigate before proceeding.

```bash
pwsh -NoProfile -Command "Get-Process calibre -ErrorAction SilentlyContinue"
```
Expected: returns nothing. If Calibre GUI is running, close it (it locks its library exclusively, per [AutobookCmdlets.ps1:301-305](F:\Obsidian\SecondBrain\Resources\SB-PSModules\Public\Utility\AutobookCmdlets.ps1)).

- [ ] **Step 2: Run the dev server and trigger one full Prep Pack**

Start the dashboard:
```bash
cd dashboard && npm run dev
```

In browser:
1. Navigate to the Irving Materials → IT Network and Sys Admin application.
2. Click Prep Pack.
3. Step 1: leave defaults (Steffan, Standard, Single, Kindle ON, KFX). Add Custom Focus: "Lean heavy on PowerShell automation and infrastructure standardization."
4. Click Next.
5. Step 2: scan the assembled source. Confirm `### Instructions` is at the top with your text.
6. Click Render.
7. Confirm toast says "Prep Pack rendering started" with the job stem.

This kicks off the real subprocess and will take ~5–10 minutes for the audio render.

- [ ] **Step 3: Wait and verify outputs**

Watch:
- Discord channel for the success embed (or failure embed if something broke).
- `F:\Obsidian\SecondBrain\Inbox\` — confirm `irving_materials_it_network_and_sys_admin_prep_<timestamp>.txt` exists with `### Instructions` at the top.
- `F:\Projects\EbookAutomation\output\audiobooks\` — `<stem>.mp3` exists, plays in your audio player.
- `F:\Obsidian\SecondBrain\Learning\Audiobooks\` — vault note exists with proper frontmatter.
- `F:\Projects\EbookAutomation\output\kindle\` — `.kfx` (or `.azw3` if KFX fell back) exists.
- `%LOCALAPPDATA%\CareerPilot\prep-pack\logs\<stem>.log` — full transcript captured.

- [ ] **Step 4: Verify the Discord embed reports actual formats**

If the Kindle file landed as `.azw3` instead of `.kfx`, the Discord message must say `Kindle: AZW3 (requested KFX — fallback)`. This is the spec's contract from the brainstorm doc.

If the Discord message claims KFX but the actual file is AZW3, the wrapper has a bug — fix `run-prep-pack.ps1`'s artifact-inspection logic before considering this task done.

- [ ] **Step 5: No commit needed (manual verification task)**

### Task F2: Register the new cross-project dependency

**Files:**
- Modify: `F:\Obsidian\SecondBrain\Resources\project-dependencies.json`

- [ ] **Step 1: Add the new edge**

Open the file. Inside the `"dependencies"` array, add this object (after the existing CareerPilot → SecondBrain entries):

```json
{
  "from": "CareerPilot",
  "to": "SecondBrain",
  "type": "content-pipeline",
  "summary": "CareerPilot Prep Pack wizard writes assembled source .txt to vault Inbox and invokes Invoke-SBAutobook subprocess for audiobook + Kindle generation",
  "interfaces": [
    "Filesystem write: F:\\Obsidian\\SecondBrain\\Inbox\\<company>_<title>_prep_<YYYY-MM-DD-HHMM>.txt",
    "Source-file convention: leading '### Instructions' block carries wizard's Custom Focus",
    "Subprocess: pwsh -NoProfile -ExecutionPolicy Bypass -File dashboard/tools/run-prep-pack.ps1 -InputFile ... -Voice ... -Depth ... -Mode ... [-ProduceKindle -KindleFormat ...]",
    "Discord webhook: POSTs job result to /api/discord-relay on completion",
    "Outputs: F:\\Obsidian\\SecondBrain\\Learning\\Audiobooks\\<stem>.md, F:\\Projects\\EbookAutomation\\output\\audiobooks\\<stem>.mp3, F:\\Projects\\EbookAutomation\\output\\kindle\\<stem>.{kfx,azw3}"
  ],
  "tickets": ["CAR-182"]
}
```

Update `last_updated` at the top of the file:

```json
"last_updated": "2026-04-25 (CAR-182 prep-pack pipeline)",
```

- [ ] **Step 2: Validate JSON**

```bash
cd "F:/Obsidian/SecondBrain" && pwsh -NoProfile -Command "Get-Content Resources/project-dependencies.json -Raw | ConvertFrom-Json | Out-Null; Write-Host 'JSON valid'"
```
Expected: `JSON valid`.

- [ ] **Step 3: Commit (in the SecondBrain repo, not the CareerPilot worktree)**

This file lives in the SecondBrain vault, not the CareerPilot repo. Commit there directly to main per project convention:

```bash
cd "F:/Obsidian/SecondBrain"
git add Resources/project-dependencies.json
git commit -m "[CAR-182] feat: register CareerPilot prep-pack content-pipeline edge"
```

### Task F3: Update CareerPilot feature manifest

**Files:**
- Modify: `dashboard/feature-manifest.json` (back in the CareerPilot worktree)

- [ ] **Step 1: Inspect the current manifest**

```bash
cd "F:/Projects/CareerPilot/.worktrees/CAR-182-prep-pack-export/dashboard"
cat feature-manifest.json
```

Note the existing schema (likely `{ features: [{ name, description, smokeTest }] }`).

- [ ] **Step 2: Append a new feature entry**

The manifest schema (verified against the existing file) is `{ ticket, name, file, exports, patterns, area }`. Append three entries to the `features` array:

```json
{
  "ticket": "CAR-182",
  "name": "Prep Pack Modal",
  "file": "src/components/applications/prep-pack-modal.tsx",
  "exports": ["PrepPackModal"],
  "patterns": ["Custom Focus", "Render", "Voice", "Depth", "Mode"],
  "area": "applications"
},
{
  "ticket": "CAR-182",
  "name": "Prep Pack Source Assembler",
  "file": "src/lib/prep-pack/assemble-source.ts",
  "exports": ["assembleSource"],
  "patterns": ["### Instructions", "Career Narrative Angle", "Tech Stack"],
  "area": "prep-pack"
},
{
  "ticket": "CAR-182",
  "name": "Prep Pack API Route",
  "file": "src/app/api/prep-pack/route.ts",
  "exports": ["POST"],
  "patterns": ["Invoke-SBAutobook", "spawn", "DiscordWebhookUrl"],
  "area": "api"
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/feature-manifest.json
git commit -m "[CAR-182] feat: register prep-pack-export feature in manifest"
```

### Task F4: Open PR and request review

- [ ] **Step 1: Push the worktree branch**

```bash
cd "F:/Projects/CareerPilot/.worktrees/CAR-182-prep-pack-export"
git push -u origin worktree/CAR-182-prep-pack-export
```

- [ ] **Step 2: Open PR (target `feature/dashboard-v2`, NOT `main`)**

```bash
gh pr create --base feature/dashboard-v2 --title "[CAR-182] Prep Pack export — wizard + subprocess pipeline" --body "$(cat <<'EOF'
## Summary
- Two-step wizard on application card exports Intelligence to a `.txt` and runs `Invoke-SBAutobook` as a detached subprocess
- Produces audiobook (MP3) + optional Kindle ebook (KFX/AZW3) + vault note
- Discord notification on success/failure with actual-vs-requested format reporting

## Test plan
- [ ] Unit tests pass: `cd dashboard && npx vitest run`
- [ ] Pester tests pass: `pwsh -Command "Invoke-Pester -Path dashboard/tools/run-prep-pack.Tests.ps1"`
- [ ] End-to-end: Irving Materials test target produces all expected artifacts
- [ ] Discord embed reports actual format (not just requested)
- [ ] Empty-Intelligence application disables Prep Pack button

## Spec / plan
- Brainstorm: docs/brainstorms/2026-04-25-prep-pack-export-design.md
- Plan: docs/plans/2026-04-25-002-car-tbd-prep-pack-export-plan.md
EOF
)"
```

- [ ] **Step 3: Move ticket to In Review**

The Stop hook should auto-update the Jira ticket; if not, run `mcp__atlassian__jira_transition_issue` to transition CAR-182 to "In Review".

---

## Spec coverage check

| Spec section | Covered by task |
|--------------|-----------------|
| CP-1 application card button | E1 |
| CP-2 Wizard Step 1 (Configure) | D1 |
| CP-3 Wizard Step 2 (Preview & Edit) | D1 |
| CP-4 backend `/api/prep-pack` endpoint | C1 |
| CP-5 subprocess wrapper + Discord webhook | B1 |
| SB-1, SB-2 (no work needed) | Investigation already complete |
| Adapter from `IntelligenceData` to `IntelligenceSnapshot` | A4 |
| Custom Focus → `### Instructions` block | A3 (`assembleSource` test + impl), B1 (cmdlet receives it via `-FromFile`) |
| Empty-section omission | A3 |
| Naming convention | A2 |
| Discord on success + failure with actual-vs-requested | B1 |
| Cross-project edge registration | F2 |
| Irving Materials test target | F1 |

## Dependency graph between streams

```
A1 (types) ──► A2 (naming) ──► A3 (assembler) ──► A4 (adapter) ──► D1 (modal) ──► E1 (button) ──► F1 (E2E) ──► F2 ──► F3 ──► F4
                              │
                              ├──► C1 (route) ─────────────────────────────────────────────────┘
                              │
B1 (wrapper) ────────────────┘
```

A1 must run first; B1 can run anytime. A4 depends on A1 + A3's `IntelligenceSnapshot` type. C1 needs A2 + A3 (the wrapper script must exist on disk for E2E, but unit tests don't need it). D1 needs A3 + A4. E1 needs D1 + A4. F1 needs everything.

## YAGNI guardrails

- **No retry logic** in the route or wrapper. Subprocess runs once; user re-clicks for re-run.
- **No live progress UI**. Discord on completion is the channel.
- **No parallelism limits**. User clicks twice → two parallel renders → two Discord pings → two timestamped artifact sets. The naming policy (Q6) makes this safe.
- **No EPUB output**. Calibre intermediate, not a final delivery format.
- **No new SB cmdlet parameters**. Existing `-FromFile`, `-Structure`, `-Voice`, `-Depth`, `-ProduceKindle`, `-OutputPrefix` cover everything.
- **No new MCP tool**. The existing `/api/discord-relay` route is the integration point.
- **No status polling endpoint**. The expected file paths returned in the 202 response are enough — the user can check disk if Discord is down.
