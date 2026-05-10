---
title: ClaudeInfra Hook Parity Gap Analysis — Cross-Project Methodology
date: 2026-05-10
category: docs/solutions/best-practices/
module: claude-code-hooks
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - Adding a new project to the Claude Code harness
  - Auditing an existing project after ClaudeInfra's hook inventory has grown
  - A session note or cross-project analysis flags cold-start friction or degraded tool output management
resolution_type: config_change
tags:
  - hooks, settings-json, claude-code, developer-experience, qwen, session-continuity,
    gap-analysis, infra-parity
---

# ClaudeInfra Hook Parity Gap Analysis — Cross-Project Methodology

## Context

Claude Code hooks are distributed across three scopes in this infrastructure. The **global** `~/.claude/settings.json` provides a baseline every project receives automatically. **ClaudeInfra's project** `.claude/settings.json` is the reference implementation — new Qwen-backed hooks land there first. **Each project's own** `.claude/settings.json` sits on top, but it does not automatically inherit ClaudeInfra additions.

This means every time a new hook is shipped to ClaudeInfra (INFRA-334 through INFRA-357 in the May 2026 batch), every other project silently falls behind. There is no rollout mechanism — the gap accumulates until a deliberate analysis is run.

The symptoms are subtle and compounding:
- Every session starts cold. No structured handoff artifact exists from the prior session; the agent re-reads git log and re-discovers open questions from scratch.
- Tool output floods the context window unchecked. Read and Bash results arrive at full size; Qwen compression and semantic extraction do not run.
- Tests pass or fail silently without an auto-suggestion layer prompting follow-up coverage.
- Token budget is not monitored; no sentinel fires before the context window is exhausted.

This document records the gap analysis methodology applied to CareerPilot on 2026-05-10 (commit `f7b7e41`, tickets CAR-223/224/225). The pattern is directly reusable for EbookAutomation and any future project. The analysis takes a few minutes; the application is a single JSON edit.

The gap existed silently from the INFRA ship date through 2026-05-10. It was noticed because the CareerPilot settings file happened to be visible in the IDE during the May 9 ClaudeInfra brainstorm session, but no action was taken at that time. Without a deliberate audit trigger, gaps can persist indefinitely. (session history)

---

## Guidance

### Step 1 — Catalog global hooks (the "already covered" set)

Read `~/.claude/settings.json`. Note every hook by event type and script name. Do not re-add these to project settings — they fire for all projects automatically.

As of 2026-05-10, the global baseline covers:
- `SessionStart`: `Invoke-PreflightDispatcher.ps1`, `Invoke-HookHealthChecker.ps1`
- `Stop`: `Write-SessionNote.ps1`, `Invoke-MemoryDistiller.ps1`, chimes
- `PostToolUse(Edit|Write|MultiEdit)`: Python syntax check
- `PostToolUse(Bash)`: `Invoke-PrDescriptionDrafter.ps1`
- `UserPromptSubmit`: `Write-PromptContext.ps1`
- `PreToolUse(Write)`: `Validate-WritePathInterpolation.ps1`

### Step 2 — Catalog ClaudeInfra project hooks (the reference set)

Read `F:\Projects\ClaudeInfra\.claude\settings.json`. As of 2026-05-10, the project-level additions are:

| Event | Script | INFRA |
|---|---|---|
| `SessionStart` | `Invoke-SessionContextLoader.ps1` | INFRA-349 |
| `Stop` | `Invoke-SessionDistiller.ps1` | INFRA-347 |
| `Stop` | `Invoke-SessionMemoryWriter.ps1` | INFRA-357 |
| `PostToolUse(Read\|Bash\|Grep\|Glob\|WebFetch)` | `Invoke-ToolOutputCompressor.ps1` | INFRA-334 |
| `PostToolUse(Read)` | `Invoke-SemanticSectionExtractor.ps1` | INFRA-339 |
| `PostToolUse(Grep)` | `Invoke-GrepResultRanker.ps1` | INFRA-342 |
| `PostToolUse(Bash)` | `Invoke-BashOutputParser.ps1` | INFRA-344 |
| `PostToolUse(Read)` | `Invoke-SolutionsPropagator.ps1` | INFRA-345 |
| `PostToolUse(Bash)` | `Invoke-AutoTestSuggester.ps1` | INFRA-346 |
| `PostToolUse(.*)` | `Invoke-TokenBudgetSentinel.ps1` | INFRA-343 |
| `PreToolUse(Bash)` | `Invoke-PreCommitReviewer.ps1` | INFRA-350 |
| Setting | `skillListingBudgetFraction: 0.03` | — |

### Step 3 — Catalog the target project's current hooks

Read `<project>/.claude/settings.json`. CareerPilot before this change had **no hooks section at all** — only `enabledPlugins`, `skillFilterAllowlist`, and `skillOverrides`. The entire project-level hook set was a gap.

### Step 4 — Compute the delta

```
gap = (ClaudeInfra project hooks) − (global hooks) − (target project hooks already present)
```

### Step 5 — Score each gap hook for project-specific fit

Not every hook should be applied blindly. Score Medium or higher to include:

| Hook | Question to ask | Skip if… |
|---|---|---|
| `Invoke-AutoTestSuggester` | Does the project have a test suite? | No test suite — skipped for SecondBrain, included for CareerPilot (has `pytest`) |
| `Invoke-BashOutputParser` | Is the project bash-heavy? | Rarely runs Bash beyond git ops — Low/skip |
| `Invoke-ToolOutputCompressor` | Does it read large files or run verbose commands? | Almost never skip — universally valuable |
| `Invoke-SemanticSectionExtractor` | Does it have large structured files (plans, CLAUDE.md)? | Project has no large structured docs — skip |
| `Invoke-SolutionsPropagator` | Does it have a `docs/solutions/` directory? | No solutions docs — skip |
| Session continuity triad | Active development with multi-session context? | Rarely skip — highest ROI for any project |
| `Invoke-TokenBudgetSentinel` | Any project running tool-heavy sessions? | Universal — essentially never skip |
| `Invoke-PreCommitReviewer` | Active git workflow with real commits? | Read-only projects — skip |

### Step 6 — Apply via a single JSON edit

Add only the delta hooks to the project's `.claude/settings.json`. The settings.json shape after CareerPilot's gap fill:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-SessionContextLoader.ps1\"",
            "timeout": 10,
            "statusMessage": "Loading prior session context..."
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-SessionDistiller.ps1\"",
            "timeout": 60,
            "statusMessage": "Qwen distilling session..."
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-SessionMemoryWriter.ps1\"",
            "timeout": 15,
            "statusMessage": "Writing session facts to memory..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Read|Bash|Grep|Glob|WebFetch",
        "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-ToolOutputCompressor.ps1\"", "timeout": 90, "statusMessage": "Qwen compressing large output..." }]
      },
      {
        "matcher": "Read",
        "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-SemanticSectionExtractor.ps1\"", "timeout": 60, "statusMessage": "Qwen extracting relevant sections..." }]
      },
      {
        "matcher": "Read",
        "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-SolutionsPropagator.ps1\"", "timeout": 45, "statusMessage": "Qwen finding related solutions..." }]
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-AutoTestSuggester.ps1\"", "timeout": 45, "statusMessage": "Qwen suggesting test coverage..." }]
      },
      {
        "matcher": "Grep",
        "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-GrepResultRanker.ps1\"", "timeout": 45, "statusMessage": "Qwen ranking grep results..." }]
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-BashOutputParser.ps1\"", "timeout": 45, "statusMessage": "Qwen parsing bash output..." }]
      },
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-TokenBudgetSentinel.ps1\"", "timeout": 10, "statusMessage": "Tracking token budget..." }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"F:\\Projects\\ClaudeInfra\\tools\\Invoke-PreCommitReviewer.ps1\"", "timeout": 45, "statusMessage": "Qwen reviewing staged changes..." }]
      }
    ]
  },
  "skillListingBudgetFraction": 0.03
}
```

> **Caution:** When editing a `Stop` (or any event) hooks array that may already exist in settings.json, merge into the existing array — do not create a second key for the same event. Duplicate keys in JSON silently discard one of the two arrays. A `Stop` block that already has two hooks must become a `Stop` block with four hooks, not two separate `Stop` keys. (session history)

### Step 7 — Commit and verify

Verify the file is valid JSON before committing. A single commit referencing all phase tickets is fine when the work is a single-file edit with no interdependencies.

---

## Why This Matters

**Session continuity triad is the highest-ROI gap.** The three session hooks (SessionContextLoader, SessionDistiller, SessionMemoryWriter) work as a unit. SessionDistiller writes a structured handoff artifact at session end. SessionContextLoader injects it at the next session start. SessionMemoryWriter auto-writes significant decisions to MEMORY.md. Without this triad, every session begins by re-reading git log, checking branch state, and re-discovering what was in progress. For a solo developer across four active projects, the re-orientation cost is a daily friction tax.

**Hook ordering within a Stop array matters.** SessionMemoryWriter reads the JSON artifact that SessionDistiller writes. Claude Code fires hooks in the order they appear within an array. SessionDistiller must appear before SessionMemoryWriter in the Stop array or the writer will read a stale/absent artifact. (session history)

**ToolOutputCompressor and SemanticSectionExtractor prevent context bloat.** Read and Bash results arrive at full size by default. For a project like CareerPilot with long plan documents in `docs/plans/` and `docs/brainstorms/`, a single Read call can consume a significant fraction of the working context. Qwen compression runs before context injection and can reduce this dramatically.

**AutoTestSuggester value is project-specific.** This hook was explicitly skipped for SecondBrain (no test suite) and rated HIGH for CareerPilot (active `pytest` suite under `tests/`). The project-specific assessment step exists to avoid applying hooks that add latency with no benefit. The default should be to include; skip only when there's a clear reason not to.

**skillListingBudgetFraction: 0.03** caps the skill catalog from consuming token budget at session start. With a large plugin set, the skill listing can crowd out working context in long sessions. 3% is the ClaudeInfra-validated value.

---

## When to Apply

1. **New project added to the harness** — run immediately after initial scaffolding. All new projects start with only global hooks.
2. **New INFRA hook merged** — when a ClaudeInfra INFRA ticket ships a new project-level hook, check every other active project for the same gap.
3. **Session note flags cold starts or context bloat** — a recurring complaint of "starting from scratch" or "context window full" is a symptom of missing session continuity or compression hooks.
4. **Project characteristics change** — if a project acquires a test suite, adds large structured documents, or becomes more bash-heavy, re-evaluate hooks that were previously skipped.

The analysis is three file reads and a diff. The application is one JSON edit. Run it freely.

---

## Examples

### CareerPilot fit assessment (2026-05-10)

| Hook | INFRA | Score | Rationale |
|---|---|---|---|
| `Invoke-SessionContextLoader` | INFRA-349 | **High** | Active multi-ticket development; cold starts are frequent friction |
| `Invoke-SessionDistiller` | INFRA-347 | **High** | Structured handoffs critical across 4 active projects |
| `Invoke-SessionMemoryWriter` | INFRA-357 | **High** | MEMORY.md actively maintained; auto-writing decisions reduces upkeep |
| `Invoke-ToolOutputCompressor` | INFRA-334 | **High** | Reads large plan/brainstorm files; pytest output can be verbose |
| `Invoke-SemanticSectionExtractor` | INFRA-339 | **High** | Long structured files in `docs/plans/` and `docs/brainstorms/` |
| `Invoke-SolutionsPropagator` | INFRA-345 | **High** | `docs/solutions/` actively maintained |
| `Invoke-AutoTestSuggester` | INFRA-346 | **High** | Real `pytest` suite under `tests/` — direct leverage |
| `Invoke-BashOutputParser` | INFRA-344 | **Medium** | Runs pytest, git, some build ops |
| `Invoke-GrepResultRanker` | INFRA-342 | **Medium** | Regular grep usage across codebase |
| `Invoke-TokenBudgetSentinel` | INFRA-343 | **High** | Universal value |
| `Invoke-PreCommitReviewer` | INFRA-350 | **High** | Active git workflow |
| `skillListingBudgetFraction: 0.03` | — | **High** | Universal setting |

Contrast: SecondBrain scored `Invoke-AutoTestSuggester` as **Skip** (no test suite) and `Invoke-BashOutputParser` as **Low**. Same analysis, different outcomes — the per-project scoring step is what makes the methodology correct rather than mechanical.

### Before state

CareerPilot's `.claude/settings.json` before 2026-05-10 had **no `hooks` key**. The project relied entirely on the global baseline. The Qwen intelligence layer (compression, semantic extraction, session distillation, pre-commit review, test suggestion) was completely absent.

### Tickets

CareerPilot gap fill was organized into three phase tickets, all created and closed Done in the same session:
- **CAR-223** — Phase 1: session continuity triad + ToolOutputCompressor + skillListingBudgetFraction
- **CAR-224** — Phase 2: PreCommitReviewer + AutoTestSuggester + SemanticSectionExtractor + SolutionsPropagator
- **CAR-225** — Phase 3: GrepResultRanker + BashOutputParser + TokenBudgetSentinel

A single commit (`f7b7e41`) applied all three phases. The phased tickets exist for tracking and rollback scoping; the implementation had no inter-phase dependencies.

---

## Related

- `docs/solutions/best-practices/` — other cross-project methodology docs
- `F:\Projects\ClaudeInfra\.claude\settings.json` — live reference implementation
- `~/.claude/settings.json` — global baseline (read before applying any project-level hooks)
- INFRA-334, INFRA-339, INFRA-342–350, INFRA-357 — individual hook implementation tickets
