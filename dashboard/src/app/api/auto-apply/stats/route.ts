import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const COST_PER_APPLICATION = 0.05

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString()

    // Today stats
    const { data: todayItems } = await supabase
      .from("auto_apply_queue")
      .select("status")
      .eq("user_id", user.id)
      .gte("updated_at", todayStart)
      .in("status", ["applied", "failed", "pending", "skipped"])

    const today = {
      applied: (todayItems || []).filter((i) => i.status === "applied").length,
      failed: (todayItems || []).filter((i) => i.status === "failed").length,
      pending: (todayItems || []).filter((i) => i.status === "pending").length,
      skipped: (todayItems || []).filter((i) => i.status === "skipped").length,
    }

    // Week stats
    const { data: weekItems } = await supabase
      .from("auto_apply_queue")
      .select("status")
      .eq("user_id", user.id)
      .gte("updated_at", weekStart)
      .in("status", ["applied", "failed"])

    const week = {
      applied: (weekItems || []).filter((i) => i.status === "applied").length,
      failed: (weekItems || []).filter((i) => i.status === "failed").length,
    }

    // Queue counts (all items by status)
    const { data: allQueue } = await supabase
      .from("auto_apply_queue")
      .select("status")
      .eq("user_id", user.id)

    const queueItems = allQueue || []
    const queue = {
      pending: queueItems.filter((i) => i.status === "pending").length,
      approved: queueItems.filter((i) => i.status === "approved").length,
      generating: queueItems.filter((i) => i.status === "generating").length,
      ready: queueItems.filter((i) => i.status === "ready").length,
      applying: queueItems.filter((i) => i.status === "applying").length,
    }

    // Daily limit
    const { data: settingsData } = await supabase
      .from("auto_apply_settings")
      .select("max_daily_applications")
      .eq("user_id", user.id)
      .single()

    const maxDaily = settingsData?.max_daily_applications || 10
    const dailyLimit = { used: today.applied, max: maxDaily }

    // Recent 5
    const { data: recentItems } = await supabase
      .from("auto_apply_queue")
      .select("id, job_title, company, status, updated_at")
      .eq("user_id", user.id)
      .in("status", ["applied", "failed", "skipped"])
      .order("updated_at", { ascending: false })
      .limit(5)

    const recent = (recentItems || []).map((i) => ({
      id: i.id,
      title: i.job_title,
      company: i.company,
      status: i.status,
      updatedAt: i.updated_at,
    }))

    const costEstimate = {
      todayCost: parseFloat((today.applied * COST_PER_APPLICATION).toFixed(2)),
      weekCost: parseFloat((week.applied * COST_PER_APPLICATION).toFixed(2)),
    }

    return NextResponse.json({ today, week, queue, dailyLimit, recent, costEstimate })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
