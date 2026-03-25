# SCRUM-142: Skill Gap Dashboard

**Date:** 2026-03-25
**Status:** Approved
**Approach:** Extend existing skills system + add demand/study tables

---

## 1. Problem

Joe needs to know which skills the job market demands, how his current skills compare, and what to study next. Currently, skill tracking is manual (14 seeded skills with 1-5 levels) and disconnected from actual job postings. Job descriptions are parsed ephemerally and discarded.

---

## 2. Architecture

Extend the existing `skills` table (single source of truth for self-ratings) with three new tables for market demand intelligence. Add a `description` column to `applications` so JD text is persisted for analysis.

New module `src/intel/skill_analyzer.py` follows the same pattern as `src/intel/company_intel.py` (Anthropic SDK, structured JSON, web_search tool for study resources).

---

## 3. Schema Changes

### 3.1 Migration: applications.description

```sql
ALTER TABLE applications ADD COLUMN description TEXT;
```

Column-existence guard (check `PRAGMA table_info(applications)` for "description" column before ALTER). Existing rows get `NULL`. `skills scan` skips applications where `description IS NULL`.

### 3.2 skill_demand

Market demand aggregated from parsed JDs.

```sql
CREATE TABLE IF NOT EXISTS skill_demand (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL UNIQUE,
    category TEXT,
    times_seen INTEGER DEFAULT 1,
    required_count INTEGER DEFAULT 0,
    preferred_count INTEGER DEFAULT 0,
    match_level TEXT,
    last_seen_in TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
```

- `category`: cloud, scripting, networking, security, os, monitoring, devops, soft_skill, other
- `match_level`: strong, partial, gap (computed by comparing against `skills` table)
- `last_seen_in`: most recent application title/company that mentioned this skill

### 3.3 study_plan

AI-generated study resources and progress tracking.

```sql
CREATE TABLE IF NOT EXISTS study_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL UNIQUE,
    priority_rank INTEGER,
    study_hours_logged REAL DEFAULT 0,
    target_hours REAL,
    resources TEXT,
    notes TEXT,
    status TEXT DEFAULT 'not_started',
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

- `resources`: JSON string, array of `{"title": "...", "url": "...", "type": "course|video|docs|project"}`
- `status`: not_started, in_progress, conversational, comfortable, completed

### 3.4 skill_application_map

Links skills to specific applications for per-JD analysis.

```sql
CREATE TABLE IF NOT EXISTS skill_application_map (
    skill_name TEXT NOT NULL,
    application_id INTEGER NOT NULL,
    requirement_level TEXT,
    FOREIGN KEY (application_id) REFERENCES applications(id),
    PRIMARY KEY (skill_name, application_id)
);
```

- `requirement_level`: required, preferred, mentioned

### 3.5 Existing tables (unchanged)

- `skills` — remains single source of truth for self-rating levels (1-5)
- `skill_log` — remains audit trail for level changes

---

## 4. Match Level Computation

`match_level` on `skill_demand` is computed by joining against the `skills` table:

1. If `skill_demand.skill_name` matches a row in `skills` where `current_level >= 3` -> "strong"
2. If matched with `current_level` 1-2 -> "partial"
3. If no match in `skills` table -> "gap"

This runs after every `skills scan` and after `skills rate`.

---

## 5. Module: src/intel/skill_analyzer.py

### 5.1 SkillGapAnalyzer class

| Method | Purpose | API Call |
|---|---|---|
| `extract_skills(job_description)` | Parse single JD, return `[{skill, category, level}]` | claude-sonnet-4-6, no tools |
| `scan_applications(conn)` | Iterate apps with descriptions, extract skills, upsert demand, map to apps | Calls `extract_skills` per JD |
| `compute_match_levels(conn)` | Update `match_level` on all `skill_demand` rows | No API call |
| `generate_study_plan(conn, gaps, max_items=5)` | Send top gaps to Claude with web_search, store resources + time estimates | claude-sonnet-4-6, web_search tool |

### 5.2 Skill extraction prompt

System prompt asks Claude to return JSON array:
```json
[
  {"skill": "Terraform", "category": "iac", "level": "required"},
  {"skill": "Python", "category": "scripting", "level": "preferred"}
]
```

Normalize skill names (lowercase comparison, merge variants like "K8s"/"Kubernetes").

### 5.3 Study plan generation prompt

System prompt asks Claude to use web_search to find current resources, then return:
```json
[
  {
    "skill": "Terraform",
    "priority": 1,
    "target_hours": 8,
    "resources": [
      {"title": "HashiCorp Learn: Get Started", "url": "https://...", "type": "course"},
      {"title": "TechWorld with Nana Terraform", "url": "https://...", "type": "video"}
    ],
    "rationale": "Mentioned in 6/12 jobs, 5 as required. High ROI for Indy market."
  }
]
```

---

## 6. CRUD Functions in models.py

| Function | Signature | Returns |
|---|---|---|
| `migrate_applications_description` | `(conn)` | None |
| `upsert_skill_demand` | `(conn, skill_name, category, requirement_level, application_id)` | row id |
| `get_skill_demand` | `(conn, min_count=1, match_level=None)` | list of dicts |
| `get_top_gaps` | `(conn, limit=10)` | list of dicts (match_level='gap', sorted by times_seen DESC) |
| `update_match_levels` | `(conn)` | None |
| `upsert_study_plan` | `(conn, skill_name, **kwargs)` | row id |
| `get_study_plan` | `(conn)` | list of dicts (ordered by priority_rank, status != 'completed') |
| `log_study_time` | `(conn, skill_name, hours, note="")` | bool |
| `map_skill_to_application` | `(conn, skill_name, application_id, requirement_level)` | None |
| `get_skills_for_application` | `(conn, application_id)` | list of dicts |

`migrate_applications_description` is called from `get_connection()` alongside the existing contacts migration.

---

## 7. Application Code Changes

### 7.1 tracker.py

`ApplicationTracker.save_job()` updated to accept and store `description` from `job_data` dict.

### 7.2 CLI commands

New subcommands under existing `skills` group:

| Command | Description |
|---|---|
| `skills scan` | Parse all applications with stored descriptions, extract skills via AI, populate skill_demand. Rich progress bar. |
| `skills gaps` | Rich table of gaps ranked by demand. Red (gap, high demand), yellow (partial), green (strong). |
| `skills plan` | Show/generate study plan. Top 5 gaps with resources, time estimates, progress bars. AI generation if empty. |
| `skills rate <skill> <1-5>` | Self-assess skill (upserts into skills table), recompute match_level. |
| `skills log <skill> <hours>` | Log study time. Optional `--note`. Shows progress bar. |
| `skills focus` | Top 3 study items by priority. Short, actionable. |
| `skills match <application_id>` | Skill match/gap for a specific application. |
| `skills report` | Full Rich report: demand + gaps + progress + recommendations. |

Existing commands preserved: `skills` (inventory), `skills update`, `roadmap` (top-level).

### 7.3 Morning scan

After contact follow-ups, show study focus if active study plan items exist:
```
Skill Focus This Week:
  1. Terraform (6 jobs, 0/8 hrs studied)
  2. Kubernetes (5 jobs, 0/6 hrs studied)
  3. Azure AZ-104 (9 jobs, 3/10 hrs studied) ####...... 30%
```

---

## 8. Files Changed

| File | Action |
|---|---|
| `src/intel/skill_analyzer.py` | Create |
| `src/db/models.py` | Modify — 3 new tables in SCHEMA_SQL, migration, CRUD functions |
| `src/jobs/tracker.py` | Modify — save_job stores description |
| `cli.py` | Modify — 8 new skills subcommands, morning scan update |
| `tests/test_skill_analyzer.py` | Create |

---

## 9. Test Coverage

- Skill extraction returns structured list from mock JD
- upsert_skill_demand increments counts on repeated calls
- update_match_levels categorizes strong/partial/gap against skills table
- Study plan upsert stores resources JSON
- log_study_time increments hours, sets started_at on first log
- skill_application_map links skills to applications
- get_top_gaps returns only gaps sorted by frequency
- get_skills_for_application returns per-JD breakdown
- migrate_applications_description is idempotent
- save_job persists description when provided
- Morning scan shows study focus when plan items exist
