"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import { Header } from "@/components/layout/header"

const ACTIVE_STATUSES = ["interested", "applied", "phone_screen", "interview"]
const POLL_INTERVAL_MS = 30_000

function useHeaderStats() {
  const { user } = useAuth()
  const [activeCount, setActiveCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()

    const fetchCounts = async () => {
      const [activeRes, totalRes] = await Promise.all([
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("status", ACTIVE_STATUSES),
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
      ])
      setActiveCount(activeRes.count ?? 0)
      setTotalCount(totalRes.count ?? 0)
    }
    fetchCounts()

    // Poll instead of realtime subscription — header counts are low-priority
    // and the applications table already has a realtime listener in use-applications.ts.
    // This avoids a duplicate subscription that was contributing to OOM.
    const interval = setInterval(fetchCounts, POLL_INTERVAL_MS)

    return () => { clearInterval(interval) }
  }, [user])

  return { activeCount, totalCount }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeCount, totalCount } = useHeaderStats()

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <Header activeCount={activeCount} totalCount={totalCount} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
