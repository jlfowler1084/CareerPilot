"use client"

import { useState, useCallback, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import type { SearchRun, Job } from "@/types"
import {
  deduplicateJobs,
  filterIrrelevant,
} from "@/lib/search-utils"

const supabase = createClient()

interface CreateRunParams {
  profilesUsed: string[]
  totalResults: number
  indeedCount: number
  diceCount: number
  newCount: number
}

export function useSearchHistory() {
  const [runs, setRuns] = useState<SearchRun[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  const loadHistory = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("search_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)

    if (data) {
      setRuns(data as SearchRun[])
    }
    setLoading(false)
  }, [])

  const loadRunResults = useCallback(async (runId: string): Promise<Job[]> => {
    const { data } = await supabase
      .from("search_cache")
      .select("results")
      .eq("search_run_id", runId)
      .order("searched_at", { ascending: false })

    if (!data || data.length === 0) return []

    const allJobs: Job[] = []
    for (const entry of data) {
      if (entry.results && Array.isArray(entry.results)) {
        allJobs.push(...(entry.results as unknown as Job[]))
      }
    }

    return filterIrrelevant(deduplicateJobs(allJobs))
  }, [])

  const createRun = useCallback(
    async (params: CreateRunParams): Promise<string | null> => {
      if (!user) return null

      const { data, error } = await supabase
        .from("search_runs")
        .insert({
          user_id: user.id,
          profiles_used: params.profilesUsed,
          total_results: params.totalResults,
          indeed_count: params.indeedCount,
          dice_count: params.diceCount,
          new_count: params.newCount,
        })
        .select("id")
        .single()

      if (error || !data) return null

      // Refresh history so the new run appears
      await loadHistory()
      setActiveRunId(data.id)
      return data.id
    },
    [loadHistory, user]
  )

  const deleteRun = useCallback(
    async (runId: string) => {
      // Clear the FK references first (ON DELETE SET NULL handles this, but be explicit)
      await supabase
        .from("search_cache")
        .update({ search_run_id: null })
        .eq("search_run_id", runId)

      const { error } = await supabase
        .from("search_runs")
        .delete()
        .eq("id", runId)

      if (!error) {
        setRuns((prev) => prev.filter((r) => r.id !== runId))
        if (activeRunId === runId) {
          setActiveRunId(null)
        }
      }
    },
    [activeRunId]
  )

  const clearAll = useCallback(async () => {
    const runIds = runs.map((r) => r.id)
    if (runIds.length === 0) return

    // Clear FK references
    await supabase
      .from("search_cache")
      .update({ search_run_id: null })
      .in("search_run_id", runIds)

    await supabase
      .from("search_runs")
      .delete()
      .in("id", runIds)

    setRuns([])
    setActiveRunId(null)
  }, [runs])

  // Load history on mount and set active run to most recent
  // Future consideration: auto-delete runs older than 30 days
  useEffect(() => {
    loadHistory().then(() => {
      setRuns((prev) => {
        if (prev.length > 0 && !activeRunId) {
          setActiveRunId(prev[0].id)
        }
        return prev
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    runs,
    activeRunId,
    loading,
    loadHistory,
    loadRunResults,
    createRun,
    deleteRun,
    clearAll,
    setActiveRunId,
  }
}
