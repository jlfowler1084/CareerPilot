@AGENTS.md

## Prompt Template Standard (INFRA-96)

Every Claude Code session in this project MUST begin with a prompt that follows this format:

```
[CAR-xxx] Brief summary of work being performed
```

### Validation Rules

- **Jira ticket is mandatory** — First line must start with a CAR ticket key in brackets (e.g., `[CAR-122]`). If the user's initial prompt doesn't include one, ask: "What's the CAR ticket for this work?" before proceeding.
- **Summary line is mandatory** — One sentence on the same line as the ticket key describing what's being done.
- **Model tier declaration** — Prompts should include a `Model: Haiku|Sonnet|Opus` line. If missing, default to Sonnet for this project unless the task is clearly Haiku-level (classification, extraction, simple relay).
- **Jira closure** — Every completed session must end with:
  - A comment on the CAR ticket summarizing changes
  - Transition to Done (transition id: `31`) unless blocked

### Model Routing (CareerPilot-specific)

- **Haiku** (`claude-haiku-4-5-20251001`): Email classification, extraction, simple relay tasks, debrief analysis, fit scoring
- **Sonnet**: Multi-file code changes, investigation, UI work, API route development, bug fixes
- **Opus**: Architecture planning, multi-system integration design

Before any new Claude API call in application code: justify the model choice in a code comment and verify it can't be replaced with rules-based logic, an MCP server, or a direct API call.

## Session Boundaries

- **Start of session:** Run `tools/regression-check.sh` and verify all features pass before making changes.
- **End of session:** Run `tools/regression-check.sh` again. If any new features were added, add them to `feature-manifest.json` first.
- **Build gate:** Run `npm run build` before declaring any task done. TypeScript errors block completion.
