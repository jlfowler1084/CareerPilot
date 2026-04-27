import type { JobSearchResultRow } from "@/types/supabase"
import type { FitScore } from "@/types"
import { rowToJob } from "./to-job"

/**
 * Returns the subset of rows that the auto-queue 80+ effect should enqueue.
 * Pure function — no side effects, easily testable.
 */
export function rowsToAutoQueue(
  rows: JobSearchResultRow[],
  fitScores: Map<string, FitScore>,
  isInQueue: (job: { title: string; company: string }) => boolean
): JobSearchResultRow[] {
  return rows.filter((row) => {
    if (!row.easy_apply) return false
    const fitScore = fitScores.get(row.id)
    if (!fitScore || fitScore.total < 80) return false
    return !isInQueue(rowToJob(row))
  })
}
