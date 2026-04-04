import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

// POST — Log a single action during the apply process
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { queueId, applicationId, action, details, success } = await req.json() as {
      queueId?: string
      applicationId?: string
      action: string
      details?: Record<string, unknown>
      success?: boolean
    }

    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 })
    }

    const { error: insertError } = await supabase
      .from("auto_apply_log")
      .insert({
        user_id: user.id,
        queue_id: queueId || null,
        application_id: applicationId || null,
        action,
        details: (details || {}) as Json,
        success: success !== false, // default true
      })

    if (insertError) {
      return NextResponse.json({ error: `Failed to log: ${insertError.message}` }, { status: 500 })
    }

    return NextResponse.json({ logged: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET — Retrieve log entries for a queue item
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const queueId = req.nextUrl.searchParams.get("queueId")
    if (!queueId) {
      return NextResponse.json({ error: "queueId query parameter required" }, { status: 400 })
    }

    const { data: logs, error: loadError } = await supabase
      .from("auto_apply_log")
      .select("*")
      .eq("user_id", user.id)
      .eq("queue_id", queueId)
      .order("created_at", { ascending: true })

    if (loadError) {
      return NextResponse.json({ error: `Failed to load logs: ${loadError.message}` }, { status: 500 })
    }

    return NextResponse.json({ logs: logs || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
