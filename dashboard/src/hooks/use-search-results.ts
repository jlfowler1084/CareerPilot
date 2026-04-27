"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import {
  applySearchResultFilters,
  type SearchResultFilters,
} from "@/lib/search-results/filters"
import type { JobSearchResultRow, JobSearchResultUpdate } from "@/types/supabase"

const supabase = createClient()

/**
 * Reads job_search_results for the authenticated user. The CLI engine writes
 * rows on schedule (Unit 4 of CAR-188 plan); this hook is read-only with
 * surgical updates for status flips (new → viewed) and Track-flow stamping.
 *
 * RLS scopes by user_id at the server; the .eq("user_id", …) here is belt
 * and braces and matches the existing useApplications convention.
 */
export function useSearchResults(filters: SearchResultFilters = {}) {
  const { user, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<JobSearchResultRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }

    let isActive = true

    const fetchRows = async () => {
      const { data } = await supabase
        .from("job_search_results")
        .select("*")
        .eq("user_id", user.id)
        .order("last_seen_at", { ascending: false })

      if (!isActive) return
      setRows((data ?? []) as JobSearchResultRow[])
      setLoading(false)
    }
    fetchRows()

    const channel = supabase
      .channel("job-search-results-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_search_results" },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (!isActive) return
          if (payload.eventType === "INSERT") {
            setRows((prev) => [payload.new as JobSearchResultRow, ...prev])
          } else if (payload.eventType === "UPDATE") {
            setRows((prev) =>
              prev.map((r) =>
                r.id === (payload.new as JobSearchResultRow).id
                  ? (payload.new as JobSearchResultRow)
                  : r
              )
            )
          } else if (payload.eventType === "DELETE") {
            setRows((prev) =>
              prev.filter((r) => r.id !== (payload.old as JobSearchResultRow).id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      isActive = false
      supabase.removeChannel(channel)
    }
  }, [user, authLoading])

  const filtered = useMemo(
    () => applySearchResultFilters(rows, filters),
    [rows, filters]
  )

  const updateRow = useCallback(
    async (id: string, updates: JobSearchResultUpdate) => {
      // Optimistic — useApplications does the same. Revert on error keeps the
      // UI from flickering on a successful round-trip.
      const previous = rows.find((r) => r.id === id)
      if (previous) {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? ({ ...r, ...updates } as JobSearchResultRow) : r))
        )
      }

      const { error } = await supabase
        .from("job_search_results")
        .update(updates)
        .eq("id", id)

      if (error && previous) {
        setRows((prev) => prev.map((r) => (r.id === id ? previous : r)))
      }

      return { error }
    },
    [rows]
  )

  return {
    rows: filtered,
    allRows: rows,
    loading,
    updateRow,
  }
}
