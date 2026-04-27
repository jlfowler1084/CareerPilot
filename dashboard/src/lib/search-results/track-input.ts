import type { JobSearchResultRow } from "@/types/supabase"

/**
 * Maps a JobSearchResultRow to the addApplication input shape. The legacy
 * Job interface uses capitalized source names ("Indeed" / "Dice"); the new
 * job_search_results schema stores lowercase. Capitalize on the way out so
 * the existing applications surface keeps its expected source label.
 *
 * Pure helper — exported separately from the React component so tests can
 * import it without dragging in the supabase client (which fails to
 * construct when env vars aren't populated).
 */
export function buildApplicationInput(row: JobSearchResultRow): Record<string, unknown> {
  const sourceLabel =
    row.source.charAt(0).toUpperCase() + row.source.slice(1).toLowerCase()
  return {
    title: row.title ?? "",
    company: row.company ?? "",
    location: row.location ?? null,
    url: row.url,
    source: sourceLabel,
    salary_range: row.salary ?? null,
    job_type: row.job_type ?? null,
    posted_date: row.posted_date ?? null,
    profile_id: row.profile_id ?? "",
    job_description: row.description ?? null,
  }
}
