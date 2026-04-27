import type { JobSearchResultRow } from "@/types/supabase"

export type SearchResultStatus = "new" | "viewed" | "tracked" | "dismissed" | "stale"

export interface SearchResultFilters {
  profileId?: string | null
  status?: SearchResultStatus | "all"
  source?: "indeed" | "dice" | "all"
}

const ACTIVE_STATUSES: SearchResultStatus[] = ["new", "viewed", "tracked"]

/**
 * Pure filter pipeline applied to client-side rows. Server already scopes by
 * user_id via RLS; everything here is the user-facing filter set surfaced in
 * the UI. Stale/dismissed are hidden by default ("all" still excludes them so
 * the list doesn't become a graveyard); pass an explicit status to include.
 */
export function applySearchResultFilters(
  rows: JobSearchResultRow[],
  filters: SearchResultFilters
): JobSearchResultRow[] {
  return rows.filter((row) => {
    if (filters.profileId && row.profile_id !== filters.profileId) return false

    if (filters.status && filters.status !== "all") {
      if (row.status !== filters.status) return false
    } else if (!ACTIVE_STATUSES.includes(row.status as SearchResultStatus)) {
      return false
    }

    if (filters.source && filters.source !== "all") {
      if (row.source !== filters.source) return false
    }

    return true
  })
}
