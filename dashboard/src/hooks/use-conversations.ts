"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Conversation, ConversationPattern } from "@/types"

const supabase = createClient()
const DEBOUNCE_MS = 500

export function useConversations(applicationId?: string, enabled: boolean = true) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const hasFetched = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchConversations = useCallback(async () => {
    const params = new URLSearchParams()
    if (applicationId) params.set("applicationId", applicationId)

    const resp = await fetch(`/api/conversations?${params}`)
    if (resp.ok) {
      const data = await resp.json()
      setConversations(data.conversations || [])
    }
    setLoading(false)
  }, [applicationId])

  const debouncedFetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(fetchConversations, DEBOUNCE_MS)
  }, [fetchConversations])

  // Reset fetch tracking when applicationId changes
  useEffect(() => {
    hasFetched.current = false
  }, [applicationId])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    if (!hasFetched.current) {
      hasFetched.current = true
      fetchConversations()
    }

    // Real-time subscription
    const filter = applicationId
      ? `application_id=eq.${applicationId}`
      : undefined

    const channel = supabase
      .channel(`conversations-${applicationId || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          ...(filter ? { filter } : {}),
        },
        () => {
          // Debounced refetch — prevents burst of DB changes from
          // triggering parallel full-dataset reloads (OOM fix)
          debouncedFetch()
        }
      )
      .subscribe()

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      supabase.removeChannel(channel)
    }
  }, [applicationId, enabled, fetchConversations, debouncedFetch])

  const addConversation = useCallback(
    async (conversation: Partial<Conversation>) => {
      const resp = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conversation),
      })

      if (!resp.ok) {
        const data = await resp.json()
        return { data: null, error: data.error }
      }

      const data = await resp.json()
      return { data: data.conversation, error: null }
    },
    []
  )

  const updateConversation = useCallback(
    async (id: string, updates: Partial<Conversation>) => {
      const resp = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      if (!resp.ok) {
        const data = await resp.json()
        return { data: null, error: data.error }
      }

      const data = await resp.json()
      return { data: data.conversation, error: null }
    },
    []
  )

  const deleteConversation = useCallback(async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" })
  }, [])

  return {
    conversations,
    loading,
    addConversation,
    updateConversation,
    deleteConversation,
  }
}

export function useConversationPatterns() {
  const [patterns, setPatterns] = useState<ConversationPattern | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPatterns = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const resp = await fetch("/api/conversations/patterns")
      if (!resp.ok) {
        const data = await resp.json()
        setError(data.error || "Failed to load patterns")
        return
      }
      const data = await resp.json()
      setPatterns(data.patterns)
    } catch {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }, [])

  return { patterns, loading, error, fetchPatterns }
}
