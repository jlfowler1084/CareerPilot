import { createClient } from "@/lib/supabase/client"
import type { ActivityEntry } from "@/types"

const supabase = createClient()

export async function logActivity(action: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action,
  })
}

export async function fetchRecentActivity(
  limit: number = 8
): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Failed to fetch activity:", error)
    return []
  }

  return data || []
}
