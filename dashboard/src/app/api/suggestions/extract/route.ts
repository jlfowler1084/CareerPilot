import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { extractSuggestionsFromEmail } from "@/lib/extract-suggestions"

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const mode = body.mode as string | undefined
  const emailIds = body.email_ids as string[] | undefined

  let emails: Array<{
    id: string; subject: string | null; body_preview: string | null;
    from_domain: string | null; from_email: string; received_at: string;
  }>

  if (mode === "recent") {
    // Process recent unextracted job_alert emails from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from("emails")
      .select("id, subject, body_preview, from_domain, from_email, received_at")
      .eq("user_id", user.id)
      .eq("category", "job_alert")
      .or("suggestions_extracted.is.null,suggestions_extracted.eq.false")
      .gte("received_at", sevenDaysAgo)
      .order("received_at", { ascending: false })
      .limit(20)

    if (error || !data) {
      return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 })
    }
    emails = data
  } else if (emailIds && Array.isArray(emailIds)) {
    const { data, error } = await supabase
      .from("emails")
      .select("id, subject, body_preview, from_domain, from_email, received_at")
      .in("id", emailIds)
      .eq("user_id", user.id)

    if (error || !data) {
      return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 })
    }
    emails = data
  } else {
    return NextResponse.json({ error: "Provide mode:'recent' or email_ids" }, { status: 400 })
  }

  // Load existing suggestions for dedup (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: existingSuggestions } = await supabase
    .from("email_job_suggestions")
    .select("title, company")
    .gte("created_at", sevenDaysAgo)

  const existingKeys = new Set(
    (existingSuggestions || []).map((s: { title: string; company: string }) =>
      `${s.title.toLowerCase()}|||${s.company.toLowerCase()}`
    )
  )

  // Load applications for dedup
  const { data: apps } = await supabase
    .from("applications")
    .select("title, company")
    .eq("user_id", user.id)

  const appKeys = new Set(
    (apps || []).map((a: { title: string; company: string }) =>
      `${a.title.toLowerCase()}|||${a.company.toLowerCase()}`
    )
  )

  let processed = 0
  let suggestionsFound = 0
  let newSuggestions = 0

  for (const email of emails) {
    const suggestions = await extractSuggestionsFromEmail(email)
    processed++
    suggestionsFound += suggestions.length

    for (const s of suggestions) {
      const key = `${s.title.toLowerCase()}|||${s.company.toLowerCase()}`
      if (existingKeys.has(key) || appKeys.has(key)) continue

      await supabase.from("email_job_suggestions").insert({
        email_id: email.id,
        title: s.title,
        company: s.company,
        location: s.location || null,
        salary: s.salary || null,
        source: s.source,
        job_url: s.job_url || null,
        description: s.description || null,
        relevance_score: 0.5,
        status: "new",
      })

      existingKeys.add(key)
      newSuggestions++
    }

    // Mark email as extracted
    await supabase.from("emails").update({ suggestions_extracted: true }).eq("id", email.id)
  }

  return NextResponse.json({ processed, suggestions_found: suggestionsFound, new_suggestions: newSuggestions })
}
