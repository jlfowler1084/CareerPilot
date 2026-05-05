---
title: Spawning pwsh subprocesses from Next.js API routes on Windows (CAR-182 Prep Pack export)
date: 2026-04-26
category: docs/solutions/best-practices/
module: dashboard/prep-pack
problem_type: best_practice
component: service_object
severity: medium
applies_when:
  - Spawning a long-running pwsh script from a Next.js API route on Windows
  - Wiring a browser wizard to a CLI/cmdlet that produces files in a watched vault directory
  - Building a TypeScript assembler against a generator output whose field names live in another module
  - Adding pre-flight validation to subprocess inputs to prevent silent failures
related_components:
  - tooling
  - frontend_stimulus
tags:
  - windows
  - powershell
  - child-process-spawn
  - nextjs-api-route
  - subprocess-validation
  - schema-drift
  - prep-pack
  - car-182
---

# Spawning pwsh subprocesses from Next.js API routes on Windows (CAR-182 Prep Pack export)

## Context

CAR-182 added a "Prep Pack" feature to the CareerPilot dashboard: a two-step wizard on each Application card that pulls the Intelligence record (company brief + interview prep) for that application, assembles a curated source `.txt`, lets the user edit it inline, then POSTs to `/api/prep-pack`. The route handler writes the file to the SecondBrain vault Inbox and spawns a `pwsh` subprocess running `Invoke-SBAutobook` (a SecondBrain PowerShell cmdlet that lives in a sibling project), which produces an audiobook MP3, an optional Kindle ebook, and a vault note — delivered asynchronously with a Discord webhook ping on completion.

The integration crosses three project boundaries (CareerPilot dashboard → SecondBrain cmdlet → EbookAutomation Kindle pipeline) and runs through a Next.js API route on Windows. The work was implemented in a single session over 2026-04-25 to 2026-04-26 (the Streams A–E in the plan are organizational phases, not parallel subagents — the swarm pattern is a separate experiment, see CAR-181). The four lessons below are concrete traps that surfaced at the integration seams between phases and between projects.

## Guidance

### 1. Spawn the simple thing first on Windows

When a Next.js API route launches `pwsh.exe -File <script>`, the textbook simple config wins. Four spawn-config attempts were tried during CAR-182 in this exact order (session history):

1. **Bare `'pwsh'` + `stdio: 'ignore'`** (commit `0b7d271`) — Node couldn't find `pwsh` on PATH from the dev-server context. Fixed by resolving to absolute path `C:\Program Files\PowerShell\7\pwsh.exe` with `PWSH_BIN` env override.
2. **Null-device fds via `'nul'`** (commit `d1d2171`) — `fs.openSync('nul', 'w')` with a relative path *creates a literal file named `nul`* in the cwd; that 0-byte file then crashed Turbopack's PostCSS loader because Windows still treats the basename as reserved.
3. **Null-device fds via `os.devNull`** (commit `401f72d`) — opening `\\.\NUL` as a real fd routes correctly to the kernel sink, but pwsh still silently exited with code 0 in ~120ms without running the script body.
4. **Final: `detached: false` + `stdio: ['ignore', 'inherit', 'inherit']`** (commit `1ff639e`) — pwsh's `-File` mode requires an inherited terminal/host to bind. Any "clever" stdio detachment kills the host before the script runs.

The pattern that worked ([dashboard/src/app/api/prep-pack/route.ts:172-177](dashboard/src/app/api/prep-pack/route.ts#L172-L177)):

```ts
console.error(`[prep-pack] spawning: ${PWSH_BIN} ${args.join(' ')}`);
const child = childProcess.spawn(PWSH_BIN, args, {
  detached: false,
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: false,
});
```

Why this works:
- `detached: false` ties the child to the dev-server event loop so pwsh's host stays bound.
- `stdio: ['ignore', 'inherit', 'inherit']` closes stdin (the wrapper has no input to read) but forwards stdout/stderr to the dev-server terminal — pwsh sees a real console handle and binds its host successfully.
- `windowsHide: false` keeps the Windows-specific console visible. Setting `true` was one of the failing variations.

Anti-patterns that *didn't* work:
- `'nul'` as a path — Node treats it as a relative file path on Windows, not the null device, so it creates a literal file called `nul` in the cwd.
- `os.devNull` for stdio fds — opening `\\.\NUL` as a file handle still leaves pwsh without a console host.
- `detached: true` + `stdio: 'ignore'` — the canonical "fire and forget" pattern from the Node docs, but it severs the parent terminal pwsh needs.

The wrapper script also has a defensive canary ([dashboard/tools/run-prep-pack.ps1:75-80](dashboard/tools/run-prep-pack.ps1#L75-L80)) that writes a `.canary` file before `Start-Transcript` runs, so "did the script start at all" is decoupled from "did the transcript open" — useful while debugging the spawn-config attempts.

The one acknowledged tradeoff: killing the dev server kills in-flight wrappers. For a single-user local dashboard that's acceptable; the wrapper writes a transcript anyway and re-clicking Render is cheap.

### 2. Verify external schemas BEFORE assuming field names

The assembler in [dashboard/src/lib/prep-pack/assemble-source.ts](dashboard/src/lib/prep-pack/assemble-source.ts) consumes an `IntelligenceSnapshot` ([types.ts:25-55](dashboard/src/lib/prep-pack/types.ts#L25-L55)) — a flat camelCase shape (`careerNarrativeAngle`, `likelyQuestions`, `whyGoodFit`). The actual generators that *produce* the data live in [dashboard/src/lib/intelligence/generators/interview-prep.ts:7-24](dashboard/src/lib/intelligence/generators/interview-prep.ts#L7-L24) and emit snake_case (`career_narrative_angle`, `likely_questions`, `suggested_approach`).

The plan's first pass at A3 wrote the assembler against an imagined schema. A3.5 was inserted to correct types + assembler + tests in lockstep before A4 (the adapter) could land. Specific field divergences caught at planning (session history):

- `interviewPrep.likelyQuestions` was assumed to be `Array<{ question: string; answer: string }>` — real type is `Array<{ question: string; category?: 'behavioral' | 'technical' | 'situational' | 'culture_fit'; suggestedApproach: string }>`. The field is `suggestedApproach`, not `answer`.
- `interviewPrep.talkingPoints` was assumed to be `string` — real type is `string[]`.
- `interviewPrep.gapsToAddress` was assumed to be `string` — real type is `Array<{ gap: string; mitigation: string }>`.
- `interviewPrep.questionsToAsk` was assumed to be `string` — real type is `Array<{ question: string; why: string }>`.

The fix is captured in [adapter.ts:95-109](dashboard/src/lib/prep-pack/adapter.ts#L95-L109), where each snake_case generator field is mapped explicitly:

```ts
whyGoodFit: getString(b, 'why_good_fit'),
careerNarrativeAngle: getString(p, 'career_narrative_angle'),
likelyQuestions: getLikelyQuestions(p),
```

Heuristic: when integrating against an internal source-of-truth, grep for the *generator* (the function that writes the data into the table/JSON blob), not just the consumer. Pin every field name from the generator before writing the consumer's types.

### 3. A flag's name is not its semantics

`Invoke-SBAutobook -Structure Auto` vs `-Structure Single` looks like "auto-detect book count vs force single book." It isn't. `Single` is a *verbatim TTS* mode — no LLM planner, no rewrite, the input file goes straight to the TTS engine as-is. Both wizard modes (Single book / Series of 3) need the AI rewrite path, so both must use `-Structure Auto`. Single-vs-series book count is differentiated by an injected `Merge into one book.` directive in the source's `### Instructions` block, parsed by a merge-pattern regex at `AutobookCmdlets.ps1:634` (session history).

The fix lives in [dashboard/tools/run-prep-pack.ps1:87-96](dashboard/tools/run-prep-pack.ps1#L87-L96):

```powershell
# Both wizard modes (Single book / Series) use cmdlet -Structure Auto for
# AI-expanded narration. Structure Single is verbatim TTS conversion (no
# planner, no rewrite) -- not what we want for prep packs. Single vs Series
# book count is controlled by the source file's ### Instructions block...
$structure = 'Auto'
```

The plan's initial wrapper literally tested `Mode=Single → -Structure Single`. That mapping was the bug, discovered during the first real end-to-end run because the cmdlet's own log output revealed the verbatim-passthrough path. General rule: when a cmdlet/library has an enum parameter and the names are "obvious," run the cmdlet with each value at planning time before writing the integration. Read the cmdlet body or its dispatch table to confirm.

### 4. Validate user-controlled subprocess input

The wizard's Step 2 is a textarea pre-populated with the assembled source — the user is encouraged to edit it. A real test session pruned the textarea down to just the `### Instructions` block (deleting all the `## Career Narrative Angle`, `## Why This Role Fits`, etc. sections). The route accepted it, wrote the file, spawned pwsh — and the cmdlet exited silently 24 seconds later because `Read-SBAutobookInstructionBlock` strips the `### Instructions` block before planning, leaving zero `## ` headings for the planner to chunk on.

Pre-flight validation now sits in the route ([route.ts:58-100](dashboard/src/app/api/prep-pack/route.ts#L58-L100)), structurally mirroring the cmdlet's strip logic:

```ts
function validateSourceHasContent(sourceText: string): { ok: true } | { ok: false; reason: string } {
  // Strip the leading ### Instructions block (mirrors the cmdlet's regex
  // at AutobookCmdlets.ps1's Read-SBAutobookInstructionBlock).
  const lines = sourceText.split('\n');
  let inInstructions = false;
  const stripped: string[] = [];
  for (const line of lines) {
    if (/^### Instructions\s*$/.test(line)) { inInstructions = true; continue; }
    if (inInstructions) {
      if (/^#{1,2} /.test(line)) { inInstructions = false; }
      else { continue; }
    }
    stripped.push(line);
  }
  const strippedText = stripped.join('\n');
  if (!/^## /m.test(strippedText)) {
    return { ok: false, reason: 'Source text has no `## ` section headings...' };
  }
  if (strippedText.trim().length < 200) {
    return { ok: false, reason: 'Source text after instruction-block stripping is too short...' };
  }
  return { ok: true };
}
```

The route calls it at [route.ts:120-126](dashboard/src/app/api/prep-pack/route.ts#L120-L126) and returns `400` with the failure reason instead of spawning. Tests that pin this behaviour: [route.test.ts:195-213](dashboard/src/app/api/prep-pack/route.test.ts#L195-L213) (instruction-block-only) and [route.test.ts:215-230](dashboard/src/app/api/prep-pack/route.test.ts#L215-L230) (too-short-after-strip).

General principle: any user input that becomes a subprocess argument or stdin must be validated against the *structural shape the subprocess actually needs*, not just "non-empty." The validator should mirror the subprocess's parsing logic closely enough that "passes the validator" implies "won't silent-exit on parse failure."

## Why This Matters

Each lesson corresponds to wall-clock cost on the next similar integration:

- **Spawn config:** four attempts with full diagnostic cycles (write config, restart dev server, click through wizard, watch pwsh exit code 0 in 120ms, diagnose) cost roughly 2 hours on CAR-182. The next "Next.js spawns pwsh on Windows" feature should land in ~10 minutes by copying the `detached:false + stdio:['ignore','inherit','inherit']` pattern from `route.ts:172-177`.
- **Schema drift:** caught at A3.5 cost ~30 minutes of re-typing across `types.ts`, `assemble-source.ts`, and the test fixtures. Caught at runtime would have surfaced as silently-empty `## ` sections in the rendered audiobook — a half day of "why is the planner producing nothing useful."
- **Flag semantics:** the `-Structure Single` trap would have shipped a Single-mode prep pack that was raw TTS of the source (no AI rewrite, no narrative expansion). Almost certainly a session of "the audiobook sounds like a robot reading my notes" before someone read the cmdlet body.
- **Source-text validation:** the silent-exit failure mode burned 24 seconds × N debug iterations. Each iteration also requires re-clicking through the wizard, restarting the dev server if state got weird, and tailing the transcript file.

The compounding angle: lessons 1, 3, and 4 are all members of the same family — *Windows + subprocess + parent-process expectations*. Sibling memory entries (`click.edit() needs a blocking editor on Windows`, `CliRunner non-TTY detection uses EOFError`) are in the same family (auto memory [claude]). The cluster is large enough now that any new "spawn a child process from JS/Python on Windows" task should pre-flight against this list.

## When to Apply

- Spawning a long-running subprocess from a Next.js API route on Windows (especially `pwsh.exe -File`).
- Integrating a Next.js dashboard against a sibling project's CLI / cmdlet / external script across project boundaries.
- Building a wizard that lets the user edit content that will become a subprocess input (textarea → file → spawn argument).
- Translating a multi-step Python or PowerShell script into a Node-spawned subprocess.
- Wiring a TypeScript consumer up to an internal table/JSON blob populated by another module's generator (camelCase ↔ snake_case drift territory).
- Mapping a wizard's ergonomic enum (`Single` / `Series`) onto an external library's enum (`-Structure Auto` / `-Structure Single`) where the names superficially match but the semantics don't.

## Examples

### Example 1: Spawn config — wrong vs right

Wrong (`detached: true + stdio: 'ignore'` — what the original plan proposed and what the textbook "fire and forget" advice recommends):

```ts
const child = spawn('pwsh', args, {
  detached: true,
  stdio: 'ignore',
});
// Symptom on Windows: pwsh returns a PID, exits with code 0 in ~120ms,
// runs zero lines of the -File script. No transcript, no canary, no error.
```

Right ([dashboard/src/app/api/prep-pack/route.ts:172-177](dashboard/src/app/api/prep-pack/route.ts#L172-L177)):

```ts
const child = childProcess.spawn(PWSH_BIN, args, {
  detached: false,
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: false,
});
// stdin closed (wrapper reads no input), stdout/stderr inherit the dev
// server's terminal so pwsh's host binds and the script body actually runs.
// The route still returns 202 immediately — Node's async I/O decouples
// HTTP response from child completion without needing detached:true.
```

The test at [route.test.ts:118-123](dashboard/src/app/api/prep-pack/route.test.ts#L118-L123) pins this exact shape so it can't regress:

```ts
// stdio: ['ignore', 'inherit', 'inherit'] — stdin closed, stdout/stderr
// forwarded to dev server terminal so pwsh's host binds correctly...
expect(opts.detached).toBe(false);
expect(opts.stdio).toEqual(['ignore', 'inherit', 'inherit']);
```

### Example 2: Source-text validation against silent-subprocess-exit

The validator at [route.ts:58-100](dashboard/src/app/api/prep-pack/route.ts#L58-L100) strips the same instruction block the cmdlet will strip, then asserts what the cmdlet's planner needs to see. Without this, [route.test.ts:195-213](dashboard/src/app/api/prep-pack/route.test.ts#L195-L213) shows the failure mode that actually occurred in the dev environment: a payload whose `sourceText` is just an `### Instructions` block with no `## ` headings would return `202`, write the file, spawn pwsh, then surface a silent failure 24 seconds later. With validation, the same payload returns `400` with a clear reason:

```ts
expect(res.status).toBe(400);
const body = await res.json();
expect(body.reason).toMatch(/no `## ` section headings/i);
expect(spawnMock).not.toHaveBeenCalled();
```

The "spawn was never called" assertion is the load-bearing part — proves the validator runs *before* the side effect, not after.

## Key citations

- [dashboard/src/app/api/prep-pack/route.ts:10-27](dashboard/src/app/api/prep-pack/route.ts#L10-L27) — paths and PWSH_BIN env override
- [dashboard/src/app/api/prep-pack/route.ts:58-100](dashboard/src/app/api/prep-pack/route.ts#L58-L100) — `validateSourceHasContent`
- [dashboard/src/app/api/prep-pack/route.ts:156-177](dashboard/src/app/api/prep-pack/route.ts#L156-L177) — spawn config + rationale comment
- [dashboard/src/app/api/prep-pack/route.test.ts:118-123](dashboard/src/app/api/prep-pack/route.test.ts#L118-L123) — pinned spawn shape
- [dashboard/src/app/api/prep-pack/route.test.ts:195-230](dashboard/src/app/api/prep-pack/route.test.ts#L195-L230) — validation failure-mode tests
- [dashboard/tools/run-prep-pack.ps1:75-96](dashboard/tools/run-prep-pack.ps1#L75-L96) — canary file + Structure=Auto rationale
- [dashboard/tools/run-prep-pack.ps1:144-175](dashboard/tools/run-prep-pack.ps1#L144-L175) — modified-since-start artifact detection
- [dashboard/src/lib/prep-pack/assemble-source.ts:13-92](dashboard/src/lib/prep-pack/assemble-source.ts#L13-L92) — silent-omit ordering
- [dashboard/src/lib/prep-pack/types.ts:25-55](dashboard/src/lib/prep-pack/types.ts#L25-L55) — camelCase `IntelligenceSnapshot`
- [dashboard/src/lib/intelligence/generators/interview-prep.ts:7-24](dashboard/src/lib/intelligence/generators/interview-prep.ts#L7-L24) — snake_case generator schema
- [dashboard/src/lib/prep-pack/adapter.ts:95-109](dashboard/src/lib/prep-pack/adapter.ts#L95-L109) — snake→camel field mapping

## Related

- [docs/brainstorms/2026-04-25-prep-pack-export-design.md](../../brainstorms/2026-04-25-prep-pack-export-design.md) — design decisions and confirmed brainstorm spec
- [docs/plans/2026-04-25-002-CAR-182-prep-pack-export-plan.md](../../plans/2026-04-25-002-CAR-182-prep-pack-export-plan.md) — implementation plan, especially Task A3.5 (schema correction) and the spawn-config rework
- PR #35 — Prep Pack export feature (still open at time of writing; merge unblocks CAR-183 Unit 6)
- Related memory entries (auto memory [claude]): `click-edit-needs-blocking-editor.md`, `clirunner-isatty-eoferror.md` — sibling Windows-subprocess gotchas
- New cross-project dependency: CareerPilot → SecondBrain (`Invoke-SBAutobook` cmdlet contract is now an external interface CareerPilot relies on)
