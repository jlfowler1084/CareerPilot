"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export interface Suggestion {
  id: string
  email_id: string
  title: string
  company: string
  location: string | null
  salary: string | null
  source: string
  job_url: string | null
  description: string | null
  relevance_score: number
  status: "new" | "interested" | "applied" | "dismissed"
  created_at: string
}

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)

  const newCount = suggestions.filter((s) => s.status === "new").length

  // Load suggestions on mount
  useEffect(() => {
    loadSuggestions()
  }, [])

  async function loadSuggestions() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Load via email join — suggestions are linked to emails which have user_id
    const { data } = await supabase
      .from("email_job_suggestions")
      .select("*, emails!inner(user_id)")
      .eq("emails.user_id", user.id)
      .neq("status", "dismissed")
      .order("created_at", { ascending: false })
      .limit(100)

    if (data) {
      setSuggestions(data.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        email_id: row.email_id as string,
        title: row.title as string,
        company: row.company as string,
        location: row.location as string | null,
        salary: row.salary as string | null,
        source: row.source as string,
        job_url: row.job_url as string | null,
        description: row.description as string | null,
        relevance_score: (row.relevance_score as number) || 0.5,
        status: row.status as Suggestion["status"],
        created_at: row.created_at as string,
      })))
    }
    setLoading(false)
  }

  const extractSuggestions = useCallback(async (): Promise<{ processed: number; found: number }> => {
    try {
      const resp = await fetch("/api/suggestions/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recent" }),
      })
      if (!resp.ok) return { processed: 0, found: 0 }
      const data = await resp.json()
      // Reload suggestions after extraction
      await loadSuggestions()
      return { processed: data.processed || 0, found: data.new_suggestions || 0 }
    } catch {
      return { processed: 0, found: 0 }
    }
  }, [])

  const dismissSuggestion = useCallback(async (id: string) => {
    // Optimistic update
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
    await fetch("/api/suggestions/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", id }),
    })
  }, [])

  const trackSuggestion = useCallback(async (id: string): Promise<string | null> => {
    // Optimistic update
    setSuggestions((prev) => prev.map((s) =>
      s.id === id ? { ...s, status: "interested" as const } : s
    ))
    try {
      const resp = await fetch("/api/suggestions/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "track", id }),
      })
      if (resp.ok) {
        const data = await resp.json()
        return data.application_id || null
      }
    } catch { /* ignore */ }
    return null
  }, [])

  const bulkDismiss = useCallback(async (ids: string[]) => {
    setSuggestions((prev) => prev.filter((s) => !ids.includes(s.id)))
    await fetch("/api/suggestions/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_dismiss", ids }),
    })
  }, [])

  const refreshSuggestions = useCallback(async () => {
    await loadSuggestions()
  }, [])

  return {
    suggestions,
    loading,
    newCount,
    extractSuggestions,
    dismissSuggestion,
    trackSuggestion,
    bulkDismiss,
    refreshSuggestions,
  }
}
