import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10)
    const viewed = req.nextUrl.searchParams.get("viewed")
    const minScore = req.nextUrl.searchParams.get("min_score")

    let query = supabase
      .from("scan_results")
      .select("*")
      .eq("user_id", user.id)
      .eq("scan_date", date)
      .eq("dismissed", false)
      .order("fit_score", { ascending: false })
      .order("created_at", { ascending: false })

    if (viewed === "true") query = query.eq("viewed", true)
    if (viewed === "false") query = query.eq("viewed", false)
    if (minScore) query = query.gte("fit_score", parseInt(minScore))

    const { data: results, error: resultsError } = await query

    if (resultsError) {
      return NextResponse.json({ error: resultsError.message }, { status: 500 })
    }

    // Fetch metadata for this date
    const { data: metadata } = await supabase
      .from("scan_metadata")
      .select("*")
      .eq("user_id", user.id)
      .eq("scan_date", date)
      .order("started_at", { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      results: results || [],
      metadata: metadata || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
