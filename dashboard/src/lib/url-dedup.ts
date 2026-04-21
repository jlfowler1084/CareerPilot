/**
 * URL-based duplicate detection for applications (CAR-167 / M4).
 *
 * Matches the behavior of the CLI's ApplicationTracker.find_by_url
 * (src/jobs/tracker.py) so that all four "add an application" entry paths
 * — CLI wizard, CLI email-import, CLI search-save, and dashboard forms —
 * surface the same duplicate prompt when a user tries to track a URL they
 * already have.
 *
 * The match rule is intentionally simple (trim whitespace, exact string
 * equality) to stay in sync with the CLI's SQL `WHERE url = ?`. If richer
 * matching is ever needed (case-insensitive, query-string-normalized,
 * canonical-form), it should be implemented once and applied in both
 * places, not diverged here.
 */

import type { Application } from "@/types"

/**
 * Find an existing application with a matching URL.
 *
 * @param url - The URL to check, pre-trim.
 * @param applications - The user's current applications (passed from the
 *   realtime-synced `useApplications` state). URL-less rows are ignored.
 * @returns The first matching Application, or `null` when none found or
 *   when `url` is empty/whitespace.
 */
export function findApplicationByUrl(
  url: string | null | undefined,
  applications: Application[],
): Application | null {
  const trimmed = (url ?? "").trim()
  if (!trimmed) return null
  return applications.find((app) => app.url && app.url.trim() === trimmed) ?? null
}

/**
 * Build the confirmation message shown to the user when a duplicate URL
 * is detected. Keeps the copy consistent across both entry forms and
 * mirrors the CLI's "Found existing application" wording.
 */
export function formatDuplicateConfirmMessage(existing: Application): string {
  const statusSuffix = existing.status ? ` (status: ${existing.status})` : ""
  return (
    `You're already tracking this URL:\n\n` +
    `${existing.title} at ${existing.company}${statusSuffix}\n\n` +
    `Add a duplicate anyway?`
  )
}
