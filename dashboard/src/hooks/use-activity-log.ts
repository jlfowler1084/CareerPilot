import { createClient } from "@/lib/supabase/client"
import type { ActivityEntry } from "@/types"

const supabase = createClient()

export async function logActivity(userId: string, action: string): Promise<void> {
  await supabase.from("activity_log").insert({
    user_id: userId,
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

  return (data || []) as unknown as ActivityEntry[]
}
