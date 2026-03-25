"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Conversation, ConversationPattern } from "@/types"

const supabase = createClient()

export function useConversations(applicationId?: string) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    fetchConversations()

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
          // Refetch to get joined application data
          fetchConversations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [applicationId, fetchConversations])

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
