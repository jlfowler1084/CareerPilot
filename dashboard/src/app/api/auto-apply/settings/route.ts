import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET — Return current settings (upsert default if none)
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let { data } = await supabase
      .from("auto_apply_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!data) {
      const { data: newSettings } = await supabase
        .from("auto_apply_settings")
        .insert({ user_id: user.id })
        .select()
        .single()
      data = newSettings
    }

    return NextResponse.json({ settings: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PUT — Update settings
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const updates = await req.json()
    delete updates.id
    delete updates.user_id
    delete updates.created_at
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("auto_apply_settings")
      .update(updates)
      .eq("user_id", user.id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Settings not found" }, { status: 404 })
    }

    return NextResponse.json({ settings: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
