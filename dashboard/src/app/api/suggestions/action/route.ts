import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { action, id, ids } = await req.json() as {
    action: "dismiss" | "track" | "apply" | "bulk_dismiss"
    id?: string
    ids?: string[]
  }

  if (action === "dismiss" && id) {
    await supabase
      .from("email_job_suggestions")
      .update({ status: "dismissed" })
      .eq("id", id)
    return NextResponse.json({ ok: true })
  }

  if (action === "bulk_dismiss" && ids && Array.isArray(ids)) {
    await supabase
      .from("email_job_suggestions")
      .update({ status: "dismissed" })
      .in("id", ids)
    return NextResponse.json({ ok: true, count: ids.length })
  }

  if (action === "track" && id) {
    // Fetch the suggestion
    const { data: suggestion, error } = await supabase
      .from("email_job_suggestions")
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (error || !suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 })
    }

    // Create application record
    const { data: app, error: appErr } = await supabase
      .from("applications")
      .insert({
        user_id: user.id,
        title: suggestion.title,
        company: suggestion.company,
        location: suggestion.location || null,
        url: suggestion.job_url || null,
        source: `${suggestion.source} (Email)`,
        salary_range: suggestion.salary || null,
        status: "interested",
        notes: suggestion.description || "",
        date_found: new Date().toISOString(),
        profile_id: "email_suggestion",
      })
      .select("id")
      .single()

    if (appErr || !app) {
      return NextResponse.json({ error: "Failed to create application" }, { status: 500 })
    }

    // Update suggestion status
    await supabase
      .from("email_job_suggestions")
      .update({ status: "interested" })
      .eq("id", id)

    return NextResponse.json({ ok: true, application_id: app.id })
  }

  if (action === "apply" && id) {
    const { data: suggestion } = await supabase
      .from("email_job_suggestions")
      .select("job_url")
      .eq("id", id)
      .maybeSingle()

    if (!suggestion?.job_url) {
      return NextResponse.json({ error: "No job URL available — search manually" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, job_url: suggestion.job_url })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
