import { createServerSupabaseClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import OverviewContent from "./overview-content"
import type { Application, ApplicationEvent } from "@/types"

export default async function OverviewPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [
    { data: applications },
    { data: events },
    { count: newMatchCount },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .order("date_found", { ascending: false }),
    supabase
      .from("application_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("search_cache")
      .select("*", { count: "exact", head: true })
      .gte("cached_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  return (
    <OverviewContent
      initialApplications={applications as Application[] | null}
      initialEvents={events as ApplicationEvent[] | null}
      initialNewMatchCount={newMatchCount ?? 0}
    />
  )
}
