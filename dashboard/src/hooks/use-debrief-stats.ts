"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DebriefStats } from "@/types/coaching"

const supabase = createClient()
const DEBOUNCE_MS = 500

export function useDebriefStats() {
  const [stats, setStats] = useState<DebriefStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortController = useRef<AbortController | null>(null)

  const fetchStats = useCallback(async () => {
    // Abort any previous in-flight request
    if (abortController.current) abortController.current.abort()
    abortController.current = new AbortController()

    try {
      const resp = await fetch("/api/debriefs/stats", {
        signal: abortController.current.signal,
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        setError(data.error || `Failed to load debrief stats (${resp.status})`)
        return
      }
      const data = await resp.json()
      setStats(data)
      setError(null)
    } catch (err) {
      // Ignore abort errors — component unmounted
      if (err instanceof DOMException && err.name === "AbortError") return
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }, [])

  const debouncedFetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(fetchStats, DEBOUNCE_MS)
  }, [fetchStats])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchStats()
    }

    const channel = supabase
      .channel("debrief-stats")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debriefs",
        },
        () => {
          debouncedFetch()
        }
      )
      .subscribe()

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (abortController.current) abortController.current.abort()
      supabase.removeChannel(channel)
    }
  }, [fetchStats, debouncedFetch])

  const refresh = useCallback(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, error, refresh }
}
