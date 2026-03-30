"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import type { ApplicationEvent, ApplicationEventType } from "@/types"

const supabase = createClient()

export function useApplicationEvents(applicationId: string | null) {
  const [events, setEvents] = useState<ApplicationEvent[]>([])
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (!applicationId) {
      setEvents([])
      return
    }

    setLoading(true)
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("application_events")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })

      setEvents(data || [])
      setLoading(false)
    }
    fetchEvents()

    // Real-time subscription for this application's events
    const channel = supabase
      .channel(`app-events-${applicationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "application_events",
          filter: `application_id=eq.${applicationId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          setEvents((prev) => [payload.new as unknown as ApplicationEvent, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [applicationId])

  const addEvent = useCallback(
    async (
      applicationId: string,
      eventType: ApplicationEventType,
      description: string,
      previousValue?: string | null,
      newValue?: string | null
    ) => {
      if (!user) return

      await supabase.from("application_events").insert({
        application_id: applicationId,
        user_id: user.id,
        event_type: eventType,
        description,
        previous_value: previousValue ?? null,
        new_value: newValue ?? null,
      })
    },
    [user]
  )

  return { events, loading, addEvent }
}
