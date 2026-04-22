# CAR-169 — M6: Remaining SQLite Tables Disposition

**Ticket:** [CAR-169](https://jlfowler1084.atlassian.net/browse/CAR-169)
**Date:** 2026-04-22
**Author:** Joe (via Claude Code M6 audit session)
**Status:** Decisions locked. No migration follow-up tickets filed.
**Parent audit:** `docs/brainstorms/CAR-163-application-entry-paths-consolidation-audit.md`

---

## 1. Premise

CAR-163 M1-M5b landed 2026-04-21 — applications and contacts are now on Supabase. The remaining 13 tables in `data/careerpilot.db` needed an explicit disposition rather than drifting indefinitely. CAR-169's acceptance criteria require a per-table decision plus any follow-up migration tickets.

## 2. Inventory

Snapshot of `data/careerpilot.db` on 2026-04-22:

| Table | Rows | Writer(s) | Read by dashboard? |
|---|---|---|---|
| `applications_deprecated_2026_04_21` | 1 | (M3 migration backup; no live writers) | No |
| `contacts_deprecated_2026_04_21` | 1 | (M5b migration backup; no live writers) | No |
| `contact_interactions` | 0 | `src/db/models.py` (via contact CLI flows) | No |
| `submitted_roles` | 0 | `src/db/models.py`, `src/agencies/recruiter_tracker.py` | No |
| `skills` | 0 | `src/db/models.py:411` | No |
| `skill_log` | 0 | `src/db/models.py:438` | No |
| `skill_demand` | 0 | `src/db/models.py:908` | No |
| `skill_application_map` | 0 | `src/db/models.py` | No |
| `study_plan` | 0 | `src/db/models.py:989` | No |
| `transcripts` | 1 | `src/transcripts/transcript_store.py:38`, `src/db/models.py:356` | No |
| `ats_portals` | 0 | `src/db/models.py:516` | No |
| `company_intel` | 0 | `src/db/models.py:803` | No |
| `kv_store` | 0 | `src/db/models.py:499` | No |
| `llm_calls` | 1 | `src/llm/logging.py:54` | No |
| `llm_budget_resets` | 1 | `src/db/models.py:396` | No |

Additional CREATE TABLE sources that have not yet initialized in the live DB (features not exercised):
- `recruiters`, `interactions` — `src/agencies/recruiter_tracker.py:32-59`
- `profile_personal`, `profile_work_history`, `profile_education`, `profile_certifications`, `profile_references`, `profile_eeo` — `src/profile/models.py:14-76`

## 3. Disposition

| Table(s) | Disposition | Rationale |
|---|---|---|
| `applications_deprecated_2026_04_21`, `contacts_deprecated_2026_04_21` | **Drop after 2026-05-21** | Migration backups from M3 and M5b. Both migrations were verified. 30-day cooldown gives a rollback window; drop afterwards. No ticket needed — in-repo reminder below. |
| `contact_interactions`, `submitted_roles` | **Stay local** | Explicit Option-C choice during M5 audit. Low-value for dashboard surfacing; CLI-only workflow today. |
| `llm_calls`, `llm_budget_resets` | **Stay local** | LLM router observability. Concern is purely CLI-internal (token budget, fallback counting). No dashboard surface contemplated. |
| `kv_store` | **Stay local** | Generic CLI scratch / config state. |
| `skills`, `skill_log`, `skill_demand`, `skill_application_map`, `study_plan` | **Stay local (for now); migrate if/when Phase 4 ships dashboard surface** | Scaffolding for Phase 4 skill-gap tracking, currently empty. Migrating empty tables for features that haven't been built is premature — the schema will likely change during build-out. Trigger for migration: first dashboard UI that reads these. |
| `transcripts` | **Stay local (for now); migrate if/when interview coaching ships dashboard surface** | Phase 4 interview analysis. Same logic as skills. |
| `ats_portals` | **Stay local** | CLI helper for tracking ATS login/portal info per company. Low volume, no cloud benefit. |
| `company_intel` | **Stay local** | Company research brief cache. Content is generated per-session by CLI and not valuable across devices. |
| `recruiters`, `interactions`, `profile_*` | **Stay local (for now)** | Not yet initialized in live DB. Revisit when the corresponding features are actually exercised; if they gain a dashboard surface at that point, migrate as part of the feature ticket. |

**Net result:** 0 migration follow-up tickets filed. 2 tables scheduled for drop on 2026-05-21.

## 4. Rule of thumb for future local-vs-cloud decisions

A table should move to Supabase **only** when either:

1. A dashboard UI reads or writes it, OR
2. Two or more of the user's devices need to share it.

Both conditions are trivially false for the remaining tables today. If Phase 4 / Phase 5 features land a dashboard surface, the feature ticket itself is the natural place to add the migration, not a separate consolidation ticket.

## 5. Reminder: drop deprecated tables

After 2026-05-21, run:

```sql
DROP TABLE IF EXISTS applications_deprecated_2026_04_21;
DROP TABLE IF EXISTS contacts_deprecated_2026_04_21;
```

Or delete `data/careerpilot.db.pre-CAR-145` / `data/careerpilot.db.pre-CAR-168` backup files if they are still present.

## 6. Acceptance criteria

- [x] Disposition documented per table (§3)
- [x] Follow-up tickets filed for any migrations (none required — §3 net result)
- [x] `CLAUDE.md` updated with the final data-layer architecture (done in same commit series as this doc)
