import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET — Return current active session with items and stats
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find items currently in an active session (status = 'applying')
    const { data: applyingItems } = await supabase
      .from("auto_apply_queue")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["applying", "applied", "failed", "skipped"])
      .order("fit_score", { ascending: false })

    const items = applyingItems || []
    if (items.length === 0) {
      return NextResponse.json({ session: null })
    }

    const stats = {
      total: items.length,
      applied: items.filter((i) => i.status === "applied").length,
      failed: items.filter((i) => i.status === "failed").length,
      skipped: items.filter((i) => i.status === "skipped").length,
      remaining: items.filter((i) => i.status === "applying").length,
    }

    // Determine session status
    const isActive = stats.remaining > 0
    const status = isActive ? "active" : "complete"

    return NextResponse.json({
      session: {
        status,
        items,
        stats,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST — Create a new apply session from ready queue items
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { queueIds } = await req.json() as { queueIds: string[] }
    if (!queueIds || !Array.isArray(queueIds) || queueIds.length === 0) {
      return NextResponse.json({ error: "queueIds array required" }, { status: 400 })
    }

    // Verify all items exist and are in 'ready' status
    const { data: items, error: loadError } = await supabase
      .from("auto_apply_queue")
      .select("*")
      .eq("user_id", user.id)
      .in("id", queueIds)
      .eq("status", "ready")

    if (loadError || !items || items.length === 0) {
      return NextResponse.json({ error: "No ready items found for the given IDs" }, { status: 400 })
    }

    // Set all items to 'applying'
    const { error: updateError } = await supabase
      .from("auto_apply_queue")
      .update({ status: "applying", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("id", items.map((i) => i.id))

    if (updateError) {
      return NextResponse.json({ error: "Failed to start session" }, { status: 500 })
    }

    // Reload updated items
    const { data: updatedItems } = await supabase
      .from("auto_apply_queue")
      .select("*")
      .eq("user_id", user.id)
      .in("id", items.map((i) => i.id))
      .order("fit_score", { ascending: false })

    return NextResponse.json({
      sessionId: `session_${Date.now()}`,
      items: updatedItems || [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH — Update a single item's status during a session
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { queueId, status, error: errorMsg, applicationId } = await req.json() as {
      queueId: string
      status: "applied" | "failed" | "skipped"
      error?: string
      applicationId?: string
    }

    if (!queueId || !status) {
      return NextResponse.json({ error: "queueId and status required" }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (errorMsg) updateData.error_message = errorMsg
    if (applicationId) updateData.application_id = applicationId

    const { error: updateError } = await supabase
      .from("auto_apply_queue")
      .update(updateData)
      .eq("id", queueId)
      .eq("user_id", user.id)

    if (updateError) {
      return NextResponse.json({ error: "Failed to update item" }, { status: 500 })
    }

    // Count remaining
    const { count } = await supabase
      .from("auto_apply_queue")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "applying")

    return NextResponse.json({ updated: true, remaining: count || 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
