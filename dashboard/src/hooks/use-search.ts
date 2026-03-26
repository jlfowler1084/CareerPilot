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
): Promise<{ jobs: Job[]; warnings: SearchError[] }> {
  const results: Job[] = []
  const warnings: SearchError[] = []
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
      if (data.error) {
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

  return { jobs: results, warnings }
}

export function useSearch() {
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
  const [cachedJobs, setCachedJobs] = useState<Pick<Job, "title" | "company">[]>([])
  const [newFlags, setNewFlags] = useState<Set<string>>(new Set())
  const [lastSearchTime, setLastSearchTime] = useState<Date | null>(null)

  const abortRef = useRef(false)

  // Load previous search_cache on init — restore recent results + build dedup cache
  useEffect(() => {
    async function loadCache() {
      const { data } = await supabase
        .from("search_cache")
        .select("results, searched_at")
        .order("searched_at", { ascending: false })
        .limit(50)

      if (!data || data.length === 0) return

      // Restore recent results (last 24h) as initial display
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const recentEntries = data.filter(
        (e: { searched_at: string }) => e.searched_at >= cutoff
      )
      if (recentEntries.length > 0) {
        const restored: Job[] = []
        for (const entry of recentEntries) {
          if (entry.results && Array.isArray(entry.results)) {
            restored.push(...(entry.results as Job[]))
          }
        }
        const deduped = deduplicateJobs(restored)
        const filtered = filterIrrelevant(deduped)
        if (filtered.length > 0) {
          setSearchResults(filtered)
          setLastSearchTime(new Date(data[0].searched_at))
          setSearchComplete(true)
        }
      }

      // Build dedup cache from all entries
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
    loadCache()
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
    setLastSearchTime(null)
    abortRef.current = false

    const total = profiles.length
    setProgress({ current: 0, total })

    let allResults: Job[] = []
    const searchErrors: SearchError[] = []

    // Sequential iteration
    for (let i = 0; i < profiles.length; i++) {
      if (abortRef.current) break

      const profile = profiles[i]
      setProgress({ current: i + 1, total })

      try {
        const { jobs, warnings: apiWarnings } = await callSearchApi(
          profile.id,
          profile.keyword,
          profile.location,
          profile.source
        )
        allResults = [...allResults, ...jobs]
        searchErrors.push(...apiWarnings)

        // Write to search_cache
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          await supabase.from("search_cache").insert({
            user_id: user.id,
            profile_id: profile.id,
            results: jobs,
            result_count: jobs.length,
          })
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

    // Show all results (new first, then seen)
    setSearchResults([...newJobs, ...seenJobs])
    setErrors(searchErrors)
    setLoading(false)
    setSearchComplete(true)

    // Update cached jobs for subsequent runs
    setCachedJobs((prev) => [
      ...prev,
      ...allResults.map((j) => ({ title: j.title, company: j.company })),
    ])
  }, [selectedProfiles, cachedJobs])

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
    isNew,
    lastSearchTime,
  }
}
