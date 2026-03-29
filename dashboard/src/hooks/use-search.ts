"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { SEARCH_PROFILES } from "@/lib/constants"
import {
  deduplicateJobs,
  filterIrrelevant,
  deduplicateAgainstCache,
} from "@/lib/search-utils"
import type { Job, SearchCacheEntry } from "@/types"

const supabase = createClient()

const DEFAULT_PROFILES = new Set([
  "sysadmin_local",
  "syseng_local",
  "contract_infra",
])

interface SearchProgress {
  current: number
  total: number
}

interface SearchError {
  profileId: string
  message: string
}

async function callSearchApi(
  profileId: string,
  keyword: string,
  location: string,
  source: string
): Promise<{ jobs: Job[]; warnings: SearchError[]; indeedInfo?: string }> {
  const results: Job[] = []
  const warnings: SearchError[] = []
  let indeedInfo: string | undefined
  const profile = SEARCH_PROFILES.find((p) => p.id === profileId)
  const profileLabel = profile?.label || profileId

  // Determine which APIs to call
  const callIndeed =
    source === "both" || source === "indeed"
  const callDice =
    source === "both" || source === "dice" || source === "dice_contract"
  const contractOnly = source === "dice_contract"

  if (callIndeed) {
    try {
      const res = await fetch("/api/search-indeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, location }),
      })
      const data = await res.json()
      if (data.jobs && Array.isArray(data.jobs)) {
        results.push(
          ...data.jobs.map((j: Job) => ({
            ...j,
            source: "Indeed" as const,
            profileId,
            profileLabel,
          }))
        )
      }
      if (data.info) {
        indeedInfo = data.info as string
      } else if (data.error) {
        warnings.push({ profileId, message: `Indeed: ${data.error}` })
      } else if (!data.jobs || data.jobs.length === 0) {
        warnings.push({ profileId, message: "Indeed returned no results" })
      }
    } catch (err) {
      warnings.push({ profileId, message: `Indeed: ${err instanceof Error ? err.message : "request failed"}` })
    }
  }

  if (callDice) {
    try {
      const res = await fetch("/api/search-dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, location, contractOnly }),
      })
      const data = await res.json()
      if (data.jobs && Array.isArray(data.jobs)) {
        results.push(
          ...data.jobs.map((j: Job) => ({
            ...j,
            source: "Dice" as const,
            profileId,
            profileLabel,
          }))
        )
      }
    } catch (err) {
      warnings.push({ profileId, message: `Dice: ${err instanceof Error ? err.message : "request failed"}` })
    }
  }

  return { jobs: results, warnings, indeedInfo }
}

interface UseSearchOptions {
  onRunCreated?: (runId: string) => void
}

export function useSearch(options: UseSearchOptions = {}) {
  const [searchResults, setSearchResults] = useState<Job[]>([])
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(
    () => new Set(DEFAULT_PROFILES)
  )
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<SearchProgress>({
    current: 0,
    total: 0,
  })
  const [searchComplete, setSearchComplete] = useState(false)
  const [errors, setErrors] = useState<SearchError[]>([])
  const [indeedInfo, setIndeedInfo] = useState<string | null>(null)
  const [cachedJobs, setCachedJobs] = useState<Pick<Job, "title" | "company">[]>([])
  const [newFlags, setNewFlags] = useState<Set<string>>(new Set())
  const [lastSearchTime, setLastSearchTime] = useState<Date | null>(null)

  const abortRef = useRef(false)

  // Build dedup cache from search_cache on init (for new-job detection)
  // Result restoration is now handled by the search history hook (run-based)
  useEffect(() => {
    async function loadDedupCache() {
      const { data } = await supabase
        .from("search_cache")
        .select("results")
        .order("searched_at", { ascending: false })
        .limit(50)

      if (!data || data.length === 0) return

      const allCached: Pick<Job, "title" | "company">[] = []
      for (const entry of data) {
        if (entry.results && Array.isArray(entry.results)) {
          for (const job of entry.results as Job[]) {
            allCached.push({ title: job.title, company: job.company })
          }
        }
      }
      setCachedJobs(allCached)
    }
    loadDedupCache()
  }, [])

  const toggleProfile = useCallback((id: string) => {
    setSelectedProfiles((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedProfiles(new Set(SEARCH_PROFILES.map((p) => p.id)))
  }, [])

  const selectNone = useCallback(() => {
    setSelectedProfiles(new Set())
  }, [])

  const stopSearch = useCallback(() => {
    abortRef.current = true
  }, [])

  const runSearch = useCallback(async () => {
    const profiles = SEARCH_PROFILES.filter((p) =>
      selectedProfiles.has(p.id)
    )
    if (profiles.length === 0) return

    setLoading(true)
    setSearchComplete(false)
    setErrors([])
    setIndeedInfo(null)
    setLastSearchTime(null)
    abortRef.current = false

    const total = profiles.length
    setProgress({ current: 0, total })

    let allResults: Job[] = []
    const searchErrors: SearchError[] = []
    const cacheIds: string[] = []
    let indeedCount = 0
    let diceCount = 0
    let indeedInfoMsg: string | undefined

    // Sequential iteration
    for (let i = 0; i < profiles.length; i++) {
      if (abortRef.current) break

      const profile = profiles[i]
      setProgress({ current: i + 1, total })

      try {
        const { jobs, warnings: apiWarnings, indeedInfo: info } = await callSearchApi(
          profile.id,
          profile.keyword,
          profile.location,
          profile.source
        )
        allResults = [...allResults, ...jobs]
        searchErrors.push(...apiWarnings)
        if (info) indeedInfoMsg = info

        // Track source counts
        for (const j of jobs) {
          if (j.source === "Indeed") indeedCount++
          else if (j.source === "Dice") diceCount++
        }

        // Write to search_cache
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          const { data: cached } = await supabase
            .from("search_cache")
            .insert({
              user_id: user.id,
              profile_id: profile.id,
              results: jobs,
              result_count: jobs.length,
            })
            .select("id")
            .single()
          if (cached) cacheIds.push(cached.id)
        }
      } catch (err) {
        searchErrors.push({
          profileId: profile.id,
          message: err instanceof Error ? err.message : "Unknown error",
        })
      }
    }

    // Post-processing: deduplicate and filter
    allResults = deduplicateJobs(allResults)
    allResults = filterIrrelevant(allResults)

    // Compare against cache
    const { new: newJobs, seen: seenJobs } = deduplicateAgainstCache(
      allResults,
      cachedJobs
    )

    // Track which jobs are new
    const newKeys = new Set(
      newJobs.map(
        (j) => `${j.title}|||${j.company}`.toLowerCase()
      )
    )
    setNewFlags(newKeys)

    // Create search run record and link cache entries
    if (cacheIds.length > 0) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: run } = await supabase
          .from("search_runs")
          .insert({
            user_id: user.id,
            profiles_used: profiles.map((p) => p.label),
            total_results: allResults.length,
            indeed_count: indeedCount,
            dice_count: diceCount,
            new_count: newJobs.length,
          })
          .select("id")
          .single()

        if (run) {
          // Link cached results to this run
          await supabase
            .from("search_cache")
            .update({ search_run_id: run.id })
            .in("id", cacheIds)

          options.onRunCreated?.(run.id)
        }
      }
    }

    // Show all results (new first, then seen)
    setSearchResults([...newJobs, ...seenJobs])
    setErrors(searchErrors)
    setIndeedInfo(indeedInfoMsg ?? null)
    setLoading(false)
    setSearchComplete(true)
    setLastSearchTime(new Date())

    // Update cached jobs for subsequent runs
    setCachedJobs((prev) => [
      ...prev,
      ...allResults.map((j) => ({ title: j.title, company: j.company })),
    ])
  }, [selectedProfiles, cachedJobs, options])

  const isNew = useCallback(
    (job: Job): boolean => {
      return newFlags.has(
        `${job.title}|||${job.company}`.toLowerCase()
      )
    },
    [newFlags]
  )

  return {
    searchResults,
    setSearchResults,
    selectedProfiles,
    toggleProfile,
    selectAll,
    selectNone,
    runSearch,
    stopSearch,
    loading,
    progress,
    searchComplete,
    errors,
    indeedInfo,
    isNew,
    lastSearchTime,
  }
}
