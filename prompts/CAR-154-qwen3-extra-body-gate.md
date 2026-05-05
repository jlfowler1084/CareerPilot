# [CAR-154] Gate Qwen3-specific extra_body in LocalProvider

**Ticket**: https://jlfowler1084.atlassian.net/browse/CAR-154
**Model tier**: Sonnet (small refactor + focused tests; no architecture decisions needed)
**Workflow**: Direct `/ship` — no brainstorm/plan phase. Scope is well-defined and small.
**Target project**: CareerPilot (`F:\Projects\CareerPilot`)
**Branch strategy**: Worktree at `F:\Projects\CareerPilot\.worktrees\CAR-154-qwen3-extra-body-gate`

## Goal

Make `LocalProvider` in `src/llm/providers/local.py` safe for non-Qwen3 models by gating the Qwen3-family-specific `extra_body` parameter behind a model-family check. This unblocks cross-family canary testing (Mistral, DeepSeek, Llama) that SB-41 will exercise when the SecondBrain canary-slot pattern lands.

## Current state (already confirmed; no re-discovery needed)

**File**: [src/llm/providers/local.py](src/llm/providers/local.py), lines 162-164:

```python
kwargs: Dict = {
    "model": model,
    "messages": messages,
    "max_tokens": max_tokens,
    # Always disable thinking — required for Qwen3 models in non-thinking mode
    "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
}
```

**Why this is a problem**: `extra_body.chat_template_kwargs.enable_thinking` is a Qwen3-family convention. Non-Qwen3 models (Mistral, DeepSeek, Llama) either ignore this (harmless) or can reject unknown chat_template_kwargs depending on vLLM's chat template config. For cross-family canary testing to be frictionless, the parameter must only be emitted when talking to a Qwen3-family model.

**Architecture context**: `LocalProvider` is otherwise fully portable. Model and base_url are constructor parameters. Strategy pattern in place at `src/llm/providers/base.py` / `claude.py` / `local.py` with dispatch via `router.py`. This is the *only* Python-level coupling point for cross-family model swaps.

## Change

1. Gate the `extra_body` emission inside `LocalProvider.complete` (`local.py`, around line 163) so it only appears when `self._chat_model` is a Qwen3-family model.
2. Minimum viable implementation: string-prefix check like `if "qwen3" in self._chat_model.lower():` — case-insensitive, matches current `qwen3.5-35b-a3b-fp8` and future `qwen3.6-*`, `qwen3.7-*` without version pinning.
3. If the conditional feels like it wants to grow, push family defaults into a small dict map (e.g., `FAMILY_EXTRA_BODY = {"qwen3": {"chat_template_kwargs": {"enable_thinking": False}}}`). Use judgment — don't over-engineer for one conditional, but don't undershoot if future providers need the same pattern.
4. Keep the existing behavior byte-identical for Qwen3 model IDs (don't change the shape of the `extra_body` dict, just its inclusion).

## Tests

Add to [tests/test_llm_providers.py](tests/test_llm_providers.py):

1. **Qwen3 path preserved**: `LocalProvider` configured with `chat_model="qwen3.5-35b-a3b-fp8"` → the call to `client.chat.completions.create` includes `extra_body={"chat_template_kwargs": {"enable_thinking": False}}`.
2. **Non-Qwen3 path clean**: `LocalProvider` configured with `chat_model="mistral-7b-instruct"` (or similar) → the call omits `extra_body` entirely (or, if always passed, omits the `enable_thinking` key).
3. **Future Qwen3 variants honored**: `chat_model="qwen3.6-35b-a3b-fp8"` and `chat_model="qwen3.7-72b-instruct"` → `extra_body` is present (family-match, not version-match).

Mock `openai.OpenAI` per the existing test pattern — see `tests/test_llm_providers.py` for how the current suite mocks the client. Do not make real network calls.

## Acceptance criteria (from Jira)

- `LocalProvider.complete` omits `extra_body.chat_template_kwargs.enable_thinking` when configured with a non-Qwen3 model
- Existing Qwen3 path behavior unchanged (request shape identical for current production config)
- New unit tests cover both branches; all existing tests still pass
- Work performed in a worktree branch, not on main

## Workflow

Use the `/ship` skill (ticket-anchored delivery):

1. `/ship CAR-154` — reads the ticket, creates worktree, drives through verify → commit → push → PR → Jira comment → ready for merge.
2. After merge, `/ship` phase B transitions CAR-154 to Done and posts close-out comment.

If `/ship` is not available for some reason, fall back to:
- Create worktree: `git worktree add F:\Projects\CareerPilot\.worktrees\CAR-154-qwen3-extra-body-gate`
- Make the edit and tests
- Run full test suite (not just the new tests) — `pytest tests/` from worktree root
- Commit with message prefix `refactor(CAR-154):` per CareerPilot conventions
- Push, open PR, comment on CAR-154 with PR link
- After merge, transition ticket to Done

## Cross-project context

This ticket is a prerequisite for clean cross-family canary testing in **SB-41** (SecondBrain, brainstorm in flight). SB-41 adds a `sb-canary` service on port 8002 that can host any model family — and CareerPilot's `LocalProvider` is a downstream consumer via the shared LLM routing contract.

**The dependency is registered** in `F:\Obsidian\SecondBrain\Resources\project-dependencies.json` as type `model-contract` with tickets `["CAR-154", "SB-41"]`.

Same-family Qwen version testing (e.g., Qwen 3.5 → 3.6) works today without CAR-154. This ticket only affects cross-family (Mistral, DeepSeek, Llama) test quality.

## Constraints

- No changes to `providers/base.py`, `providers/claude.py`, or `router.py` — scope is strictly `providers/local.py` + its test file.
- Do not refactor unrelated code in the same PR. Keep the diff tight.
- No new runtime dependencies (no new pip packages).
- Follow CareerPilot conventions (check `CLAUDE.md` in the repo root and `docs/brainstorms/local-llm-router-baseline.md` for prior design context if needed).
- The `# Always disable thinking — required for Qwen3 models in non-thinking mode` comment on line 162 will need to stay accurate after the change; update it to reflect the new conditional behavior.

## Expected deliverable

- Merged PR closing CAR-154
- Both branches of the new logic covered by tests
- No regression in existing tests
- Ticket closed with close-out comment referencing the PR
