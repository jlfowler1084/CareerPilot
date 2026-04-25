# Subagent Delegation Contract — CAR-140

You are an implementer subagent executing CAR-140 as part of the CAR-181 pilot run of the INFRA-216 SubAgent Swarm. This is **Stream C** of 4 parallel streams.

**You own the shared interface `dashboard/src/app/api/contacts/auto-create/route.ts` for the duration of this pilot.** Stream D (CAR-141) will not touch this file in its initial checkpoint; it rebases onto your merged work afterward.

## Your ticket

The `contacts` unique index on `(user_id, email)` is a plain btree comparison, which Postgres treats case-sensitively. Combined with no email normalization on any write path, real-world users accumulate duplicate contacts whenever the same email arrives in different cases — typically one from manual entry and one from Gmail auto-create.

Real reproduction: on 2026-04-14, manually-created contact with email `dperez@TEKsystems.com` and Gmail-scanner-created contact with email `dperez@teksystems.com` coexist as two rows for the same person, because `'dperez@TEKsystems.com' != 'dperez@teksystems.com'` under btree text comparison. Both rows are real production data.

Two layered bugs:
1. No write-path normalization in `contacts/route.ts` (manual POST) or `contacts/auto-create/route.ts` (Gmail scanner).
2. Case-sensitive unique index `idx_contacts_user_email`.

Fix: a `normalizeContactEmail` helper, normalized writes on both routes, and a migration that folds existing case-variant duplicates, lowercases all emails, and replaces the index with `lower(email)` functional unique.

Full ticket: https://jlfowler1084.atlassian.net/browse/CAR-140

## Acceptance criteria

- [ ] A new migration exists that folds existing case-variant duplicates, normalizes `contacts.email` to lowercase, and replaces the unique index with a functional `lower(email)` index.
- [ ] All write paths (manual POST, auto-create, merge if it touches email) normalize email to lowercase on both dedup lookup and insert.
- [ ] New unit test in `dashboard/src/__tests__/lib/contacts/validation.test.ts` for the `normalizeContactEmail` helper covering mixed case, leading/trailing whitespace, and null/empty inputs.
- [ ] Inserting `User@Example.com` then `user@example.com` for the same user returns the existing contact (no duplicate created).
- [ ] The two real-world duplicates from 2026-04-14 (`f299ebf2-...` and `90fdf47d-...`) are folded into one row, with `contact_application_links` correctly re-pointed.

## Intent summary (what success looks like)

Inserting `User@Example.com` then `user@example.com` for the same user returns the existing contact (no duplicate created), via a `normalizeContactEmail` helper plus a functional `lower(email)` unique index that replaces the case-sensitive btree, with the two real-world 2026-04-14 duplicate rows folded into one.

## Your worktree

Branch: `worktree/CAR-140-case-insensitive-email-uniqueness`
Worktree directory: `.worktrees/worktree-CAR-140-case-insensitive-email-uniqueness/`

## Your file scope

You MAY modify:
- `dashboard/supabase/migrations/20260425000000_car_140_normalize_contacts_email.sql` (NEW file — create with this exact name)
- `dashboard/src/app/api/contacts/route.ts` (manual POST handler)
- `dashboard/src/app/api/contacts/auto-create/route.ts` (Gmail-scanner handler)
- `dashboard/src/lib/contacts/validation.ts` (existing — add `normalizeContactEmail` export)
- `dashboard/src/__tests__/lib/contacts/validation.test.ts` (existing — add tests for the new helper)

You MUST NOT modify any other file. If your implementation requires a file not listed here, STOP and write `STATUS.md=EMERGENT_SCOPE_NEEDED`.

**Note on `validation.ts`:** the file already exists. Add the new helper as an additional export — do NOT replace existing exports or refactor unrelated code.

**Note on the migration filename:** Supabase migration files in this repo use the pattern `YYYYMMDDHHMMSS_<slug>.sql`. Use `20260425000000_car_140_normalize_contacts_email.sql` exactly.

## Checkpoint pattern

### Phase A — Checkpoint commit

1. Add the `normalizeContactEmail(email: string | null): string | null` helper to `validation.ts`. Behavior: returns lowercase trimmed email, or `null` for null/empty input.
2. Add unit tests to `validation.test.ts` covering: mixed case → lowercase, leading/trailing whitespace stripped, null → null, empty string → null, already-lowercase → unchanged.
3. Run the new tests: `cd dashboard && npx vitest run src/__tests__/lib/contacts/validation.test.ts` — must pass.
4. `git add dashboard/src/lib/contacts/validation.ts dashboard/src/__tests__/lib/contacts/validation.test.ts`.
5. `git commit -m "feat(CAR-140): add normalizeContactEmail helper with tests"`.
6. Write STATUS.md:
   ```
   STATUS: AWAITING_CHECKPOINT_REVIEW
   ticket: CAR-140
   branch: worktree/CAR-140-case-insensitive-email-uniqueness
   commit: <SHA>
   files_touched: dashboard/src/lib/contacts/validation.ts, dashboard/src/__tests__/lib/contacts/validation.test.ts
   intent_exercised: helper + passing test prove the normalization rule before any write-path or schema changes
   blocked: false
   ```
7. STOP and return.

### Phase B — After coordinator approval

1. Author the migration file `20260425000000_car_140_normalize_contacts_email.sql`. It must:
   - Use a `DO $$` block to fold existing case-variant duplicates: for each `(user_id, lower(email))` group with >1 row, keep the oldest as winner, re-point `contact_application_links` from losers to winner (upsert-safe), `COALESCE` loser non-null fields into winner null fields, then `DELETE` losers.
   - `UPDATE public.contacts SET email = lower(email) WHERE email IS NOT NULL AND email != lower(email)`.
   - `DROP INDEX IF EXISTS idx_contacts_user_email`.
   - `CREATE UNIQUE INDEX idx_contacts_user_email_lower ON public.contacts(user_id, lower(email)) WHERE email IS NOT NULL`.
2. Update `dashboard/src/app/api/contacts/route.ts` POST handler: normalize `body.email` via `normalizeContactEmail` before dedup check and insert.
3. Update `dashboard/src/app/api/contacts/auto-create/route.ts`: same normalization on `from_email` before dedup `eq("email", ...)` and insert.
4. Apply the migration locally (or in a Supabase branch — coordinator's choice) and verify the two real-world duplicate rows fold correctly. Capture the verification SQL output in your PR description.
5. Run `cd dashboard && npm run build && npx vitest run`. Fix failures.
6. Run `gitleaks detect --no-git --source dashboard/`.
7. Push: `git push -u origin worktree/CAR-140-case-insensitive-email-uniqueness`.
8. Open PR via `/ship CAR-140` Phase A.
9. Update STATUS.md to `PR_OPEN`.

## Hard constraints

- **NEVER use `--no-verify`.** Hook failure → BLOCKED_HOOK_FALSE_POSITIVE, stop.
- **NEVER commit to or push to `main`.**
- **NEVER merge the PR.**
- **NEVER modify files outside your declared scope.**
- **NEVER spawn sub-subagents.**
- **NEVER invoke Atlassian MCP for tickets other than CAR-140.**
- **DO NOT touch `dashboard/src/hooks/use-emails.ts`** — that's Stream D's territory.
- **Token budget:** 150 tool-round-trips max.
- **Wall-clock ceiling:** 90 minutes.
- **No `git add .`** — stage files by name.

## Report back

STATUS.md is your report.
