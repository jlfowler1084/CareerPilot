import type { JobSearchResultRow } from "@/types/supabase"
import type { Job } from "@/types"

/**
 * One-direction lossy projection of a JobSearchResultRow onto the legacy Job
 * interface. Unlocks reuse of scoreJob, applyFilters, JobCard, and all
 * existing modals without rewriting downstream consumers.
 *
 * Defaults for nullable fields are chosen to be safe for the consumers that
 * matter: salary → "Not listed" (parseSalary returns null → neutral score),
 * strings → "" (no display / no filter match), source → capitalized form
 * that the applications surface already expects.
 */
export function rowToJob(row: JobSearchResultRow): Job {
  return {
    title: row.title ?? "",
    company: row.company ?? "",
    location: row.location ?? "",
    salary: row.salary ?? "Not listed",
    url: row.url,
    posted: row.posted_date ?? "",
    type: row.job_type ?? "",
    source: (row.source.charAt(0).toUpperCase() +
      row.source.slice(1).toLowerCase()) as Job["source"],
    easyApply: row.easy_apply,
    profileId: row.profile_id ?? "",
    profileLabel: row.profile_label ?? "",
  }
}
