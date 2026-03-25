"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Email } from "@/types"

const supabase = createClient()

export interface GroupedThread {
  thread_id: string
  emails: Email[]
  latest_email: Email
  message_count: number
}

export function useCommunications(applicationId: string) {
  const [threads, setThreads] = useState<GroupedThread[]>([])
  const [totalEmails, setTotalEmails] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!applicationId) {
      setThreads([])
      setTotalEmails(0)
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error: queryError } = await supabase
        .from("email_application_links")
        .select("email_id, linked_at, emails(*)")
        .eq("application_id", applicationId)
        .order("linked_at", { ascending: false })

      if (cancelled) return

      if (queryError) {
        setError(queryError.message)
        setLoading(false)
        return
      }

      // Extract emails from the joined query
      const emails: Email[] = (data || [])
        .map((row: any) => row.emails as Email)
        .filter(Boolean)

      setTotalEmails(emails.length)

      // Group by thread_id
      const threadMap = new Map<string, Email[]>()
      for (const email of emails) {
        const key = email.thread_id || email.id
        const group = threadMap.get(key) || []
        group.push(email)
        threadMap.set(key, group)
      }

      // Build grouped threads, sorted by latest email date
      const grouped: GroupedThread[] = []
      for (const [thread_id, threadEmails] of threadMap) {
        threadEmails.sort(
          (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
        )
        grouped.push({
          thread_id,
          emails: threadEmails,
          latest_email: threadEmails[threadEmails.length - 1],
          message_count: threadEmails.length,
        })
      }

      // Sort threads by latest email date descending
      grouped.sort(
        (a, b) =>
          new Date(b.latest_email.received_at).getTime() -
          new Date(a.latest_email.received_at).getTime()
      )

      setThreads(grouped)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [applicationId])

  const unlinkEmail = async (emailId: string) => {
    await supabase
      .from("email_application_links")
      .delete()
      .eq("email_id", emailId)
      .eq("application_id", applicationId)

    // Remove from local state
    setThreads((prev) => {
      const updated: GroupedThread[] = []
      for (const thread of prev) {
        const remaining = thread.emails.filter((e) => e.id !== emailId)
        if (remaining.length > 0) {
          updated.push({
            ...thread,
            emails: remaining,
            latest_email: remaining[remaining.length - 1],
            message_count: remaining.length,
          })
        }
      }
      return updated
    })
    setTotalEmails((prev) => Math.max(0, prev - 1))
  }

  return { threads, totalEmails, loading, error, unlinkEmail }
}
