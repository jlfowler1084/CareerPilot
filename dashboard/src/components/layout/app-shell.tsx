"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import { Header } from "@/components/layout/header"

const ACTIVE_STATUSES = ["interested", "applied", "phone_screen", "interview"]

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

    const channel = supabase
      .channel("header-counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        () => fetchCounts()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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
