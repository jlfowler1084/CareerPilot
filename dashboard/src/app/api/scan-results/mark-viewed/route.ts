import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { ids, all, date } = body as {
      ids?: string[]
      all?: boolean
      date?: string
    }

    if (all && date) {
      const { error } = await supabase
        .from("scan_results")
        .update({ viewed: true })
        .eq("user_id", user.id)
        .eq("scan_date", date)
        .eq("viewed", false)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ updated: true })
    }

    if (ids && Array.isArray(ids) && ids.length > 0) {
      const { error } = await supabase
        .from("scan_results")
        .update({ viewed: true })
        .eq("user_id", user.id)
        .in("id", ids)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ updated: true })
    }

    return NextResponse.json({ error: "Provide ids array or all+date" }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
