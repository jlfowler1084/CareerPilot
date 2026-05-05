# CAR-151 — Fix INFRA-187 conformance adapter (worktree path + schema_validation coverage)

**Model tier:** Sonnet (execution session — not Opus)
**Ticket:** https://jlfowler1084.atlassian.net/browse/CAR-151
**Project root:** `F:\Projects\CareerPilot`
**Base branch:** `feature/dashboard-v2` (this project's effective main — NOT `master`)
**Worktree path:** `.worktrees/CAR-151-conformance-adapter`
**New branch name:** `fix/CAR-151-conformance-adapter`
**Upstream contract ref:** `F:\Projects\ClaudeInfra\configs\llm-routing\CONTRACT.md` (v1, INFRA-187)

## Before you start

- `git fetch origin && git pull origin feature/dashboard-v2` in the main working directory first so the worktree branches off fresh code.
- Verify `.worktrees/` is in `.gitignore` before creating the worktree (per global rules).
- Read the current adapter: `tests/test_llm_conformance.py` — the file introduced in commit `0a2f65d`.
- Read the upstream adapter contract: `F:\Projects\ClaudeInfra\configs\llm-routing\conformance\adapters\README.md` — the "Schema validation" section is the spec you'll implement against.

## What you're doing

A 2026-04-19 audit of the INFRA-187 routing contract from the ClaudeInfra side surfaced two real bugs in CareerPilot's conformance adapter. Neither is visible from green CI output — they only fail under specific conditions:

1. The adapter's `SCENARIO_DIR` still points at a worktree subdirectory that is *supposed* to have been cleaned up after INFRA-187 merged. It works today only by coincidence.
2. Scenario 01 (the load-time `pii_bearing` check) is in the contract catalog but the adapter silently filters it out because it only runs `test_type: runtime` scenarios. Per §R17 this is a contract violation, not a documented gap.

Fix both in a single small PR.

## Why this matters

INFRA-187 is a **shared contract** — ClaudeInfra publishes it and CareerPilot is the reference consumer. The adapter is the only thing proving CareerPilot is actually conformant. A green test run that silently skips scenarios lies about conformance. The worktree-path landmine also means the moment someone runs `git worktree remove` in ClaudeInfra (imminent — it's on the housekeeping list), CareerPilot's tests will explode.

## Scope — two changes in one file

### 1. Canonical scenario path

File: `tests/test_llm_conformance.py` (lines 19-22)

Current:

```python
CLAUDEINFRA_ROOT = Path(os.getenv("CLAUDEINFRA_ROOT", "F:/Projects/ClaudeInfra"))
SCENARIO_DIR = (
    CLAUDEINFRA_ROOT
    / ".worktrees/INFRA-187-llm-routing-contract/configs/llm-routing/conformance/scenarios"
)
```

Replace with:

```python
CLAUDEINFRA_ROOT = Path(os.getenv("CLAUDEINFRA_ROOT", "F:/Projects/ClaudeInfra"))
SCENARIO_DIR = CLAUDEINFRA_ROOT / "configs/llm-routing/conformance/scenarios"
```

Do **not** keep a fallback to the worktree path. The merge is permanent; the worktree path should not resolve after cleanup.

### 2. Handle `test_type: schema_validation` scenarios

The current `load_runtime_scenarios()` filters with `if scenario.get("test_type") == "runtime":`. That silently drops scenario 01.

Two sub-tasks:

**(a) Split scenario loading into two paths.** Load all scenarios, then parametrize two pytest functions:
- **Keep `test_conformance_scenario`** (existing function at line 83 — DO NOT rename) as the runtime path. Renaming would change pytest test IDs (`test_conformance_scenario[scenario-id]`) which are a silent public interface for `pytest -k` filters, CI matrix configs, and dashboards.
- Add `test_schema_validation_scenario` as a new parametrized function for `test_type == "schema_validation"`.

Inside the file, rename `load_runtime_scenarios()` → either two thin loaders (`load_runtime_scenarios()` + `load_schema_validation_scenarios()`) or a single `load_scenarios_by_type(type_str)`. Internal helper naming is free to refactor; the public test function name `test_conformance_scenario` stays stable.

**(b) Implement the schema_validation path.** Per adapter README §"Schema validation (scenario type `schema_validation`)" (line 129):

1. Load `inputs.config_json` from the scenario YAML.
2. Load the JSON schema from `CLAUDEINFRA_ROOT / "configs/llm-routing/config.schema.json"`.
3. Validate with the `jsonschema` library — already pinned at `requirements.txt:13` (`jsonschema>=4.0.0`). No dependency change needed; this project has no separate `requirements-dev.txt`.
4. Assert that `validation_fails` matches `expected.validation_fails`.

Reference outcome for scenario 01: config with missing `pii_bearing` MUST fail validation. The `jsonschema` library raises `ValidationError` — treat that as `validation_fails = True`.

## Out of scope

- Any change to `src/llm/router.py` or `config/settings.py` — the runtime env-var precedence is correct per §R12.
- Contract version pinning (low-priority audit Finding 3, successor ticket).
- Replacing the `CLAUDEINFRA_ROOT = Path(os.getenv(..., "F:/Projects/ClaudeInfra"))` default — leave the hardcoded default alone; env override is the portability mechanism.
- Any change to the ClaudeInfra contract or scenario catalog. This ticket is implementation-side only.

## Test plan

1. Run `pytest tests/test_llm_conformance.py -v` from a clean checkout. All 12 scenarios should be collected and pass (11 runtime + 1 schema_validation).
2. Confirm scenario 01 is in the test output with name `test_schema_validation_scenario[config-missing-pii-bearing-fails-load]` (or equivalent pytest-id).
3. **Worktree-cleanup proof:** in a separate shell, run `cd F:/Projects/ClaudeInfra && git worktree list`. If `.worktrees/INFRA-187-llm-routing-contract/` appears, run `git worktree remove .worktrees/INFRA-187-llm-routing-contract`. Re-run pytest — must still pass. **Do not skip this step.** It is the ONLY way to prove the worktree-path bug is actually fixed.
4. Run the full test suite (`pytest`) — no regressions in other test files.

## Commit message format

```
fix(CAR-151): INFRA-187 conformance adapter — canonical path + schema_validation coverage

- tests/test_llm_conformance.py: SCENARIO_DIR points at canonical scenarios/ path (no .worktrees/)
- tests/test_llm_conformance.py: add schema_validation scenario runner (scenario 01 now exercised)

Resolves CAR-151. Upstream: INFRA-187 (ClaudeInfra CONTRACT.md §R17).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Acceptance criteria (mirror from the Jira ticket)

- [ ] `SCENARIO_DIR` resolves to `configs/llm-routing/conformance/scenarios/` — no `.worktrees/` path component.
- [ ] Adapter exercises all 12 scenarios (11 runtime + 1 schema_validation).
- [ ] Scenario 01 passes: config missing `pii_bearing` causes schema validation to fail as expected.
- [ ] `pytest tests/test_llm_conformance.py` runs green from a clean ClaudeInfra checkout (no worktree dependency).
- [ ] Worktree-cleanup verification passes (see Test plan step 3).
- [ ] Commit message references both CAR-151 and INFRA-187.

## After merge

- Move CAR-151 to Done in Jira and add a brief comment linking the PR.
- No ClaudeInfra-side follow-up required.
