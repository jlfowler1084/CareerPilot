import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import {
  detectApplicationConfirmation,
  extractFromHints,
  buildExtractionPrompt,
  type ExtractionResult,
} from "@/lib/auto-track"

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { email_ids, force } = await req.json() as { email_ids: string[]; force?: boolean }
  if (!email_ids || !Array.isArray(email_ids) || email_ids.length === 0) {
    return NextResponse.json({ error: "email_ids required" }, { status: 400 })
  }

  // Fetch emails
  const { data: emails, error: fetchErr } = await supabase
    .from("emails")
    .select("*")
    .in("id", email_ids)
    .eq("user_id", user.id)

  if (fetchErr || !emails) {
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 })
  }

  const results: Array<{
    email_id: string
    tracked: boolean
    statusUpdated: boolean
    application_id?: string
    confidence?: number
    extraction?: ExtractionResult
    promptUser?: boolean
  }> = []

  for (const email of emails) {
    const detection = detectApplicationConfirmation({
      from_email: email.from_email,
      from_domain: email.from_domain,
      subject: email.subject,
      body_preview: email.body_preview,
      category: email.category,
      received_at: email.received_at,
    })

    // Handle rejection/status updates
    if (detection.statusUpdate === "rejected") {
      const handled = await handleStatusUpdate(supabase, user.id, email, "rejected")
      results.push({
        email_id: email.id,
        tracked: false,
        statusUpdated: handled,
        application_id: undefined,
      })
      await supabase.from("emails").update({ auto_track_status: "rejected_update" }).eq("id", email.id)
      continue
    }

    if (!detection.isConfirmation) {
      results.push({ email_id: email.id, tracked: false, statusUpdated: false })
      await supabase.from("emails").update({ auto_track_status: "skipped" }).eq("id", email.id)
      continue
    }

    // Extract application details
    let extraction = extractFromHints(
      { from_email: email.from_email, from_domain: email.from_domain, subject: email.subject, body_preview: email.body_preview, category: email.category, received_at: email.received_at },
      detection.hints,
      detection.source
    )

    // If rules-based extraction failed, try AI (only for high+ confidence or force)
    if (!extraction && (detection.confidence >= 0.7 || force)) {
      extraction = await aiExtract(email)
    }

    if (!extraction) {
      results.push({ email_id: email.id, tracked: false, statusUpdated: false, confidence: detection.confidence })
      await supabase.from("emails").update({ auto_track_status: "skipped" }).eq("id", email.id)
      continue
    }

    // Medium confidence without force → prompt user
    if (detection.confidence < 0.85 && !force) {
      await supabase.from("emails").update({
        auto_track_status: "prompted",
        auto_track_data: extraction,
      }).eq("id", email.id)
      results.push({
        email_id: email.id,
        tracked: false,
        statusUpdated: false,
        confidence: detection.confidence,
        extraction,
        promptUser: true,
      })
      continue
    }

    // High confidence or forced → create application
    const appId = await createOrLinkApplication(supabase, user.id, email.id, extraction)
    if (appId) {
      await supabase.from("emails").update({ auto_track_status: "tracked" }).eq("id", email.id)
      results.push({ email_id: email.id, tracked: true, statusUpdated: false, application_id: appId })
    } else {
      results.push({ email_id: email.id, tracked: false, statusUpdated: false })
    }
  }

  const trackedCount = results.filter((r) => r.tracked).length
  return NextResponse.json({ results, trackedCount })
}

// ── Helpers ──────────────────────────────────────────

async function aiExtract(email: { subject: string | null; body_preview: string | null; from_email: string; from_domain: string | null; received_at: string }): Promise<ExtractionResult | null> {
  try {
    const prompt = buildExtractionPrompt({
      from_email: email.from_email,
      from_domain: email.from_domain,
      subject: email.subject,
      body_preview: email.body_preview,
      category: "",
      received_at: email.received_at,
    })

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: "Extract job application details from confirmation emails. Return valid JSON only.",
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!resp.ok) return null
    const data = await resp.json()
    const text = data.content?.[0]?.text || ""
    const jsonStr = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim()
    const parsed = JSON.parse(jsonStr)

    if (!parsed.company || !parsed.title) return null

    return {
      company: parsed.company,
      title: parsed.title,
      location: parsed.location || null,
      source: parsed.source || "Direct",
      job_url: parsed.job_url || null,
      applied_date: email.received_at,
    }
  } catch {
    return null
  }
}

async function createOrLinkApplication(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  emailId: string,
  extraction: ExtractionResult
): Promise<string | null> {
  // Duplicate check
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .ilike("company", extraction.company)
    .gte("date_applied", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(5)

  const duplicate = existing?.find((app) => {
    // We check by company match (already filtered by ilike above)
    return true
  })

  let applicationId: string

  if (duplicate) {
    applicationId = duplicate.id
  } else {
    // Create new application
    const { data: newApp, error } = await supabase
      .from("applications")
      .insert({
        user_id: userId,
        title: extraction.title,
        company: extraction.company,
        location: extraction.location,
        url: extraction.job_url,
        source: extraction.source,
        status: "applied",
        date_applied: extraction.applied_date,
        date_found: extraction.applied_date,
        notes: "Auto-tracked from email confirmation",
      })
      .select("id")
      .single()

    if (error || !newApp) return null
    applicationId = newApp.id
  }

  // Link email to application
  await supabase
    .from("email_application_links")
    .upsert(
      { email_id: emailId, application_id: applicationId, user_id: userId, linked_by: "auto_track" },
      { onConflict: "email_id,application_id" }
    )

  return applicationId
}

async function handleStatusUpdate(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  email: { id: string; from_domain: string | null; classification_json: { company?: string | null } | null },
  status: "rejected"
): Promise<boolean> {
  const company = email.classification_json?.company
  if (!company) return false

  // Find matching application
  const { data: apps } = await supabase
    .from("applications")
    .select("id, status")
    .eq("user_id", userId)
    .ilike("company", `%${company}%`)
    .limit(5)

  if (!apps || apps.length === 0) return false

  // Update the most recent one
  const target = apps[0]
  await supabase
    .from("applications")
    .update({ status, date_response: new Date().toISOString() })
    .eq("id", target.id)

  // Link email
  await supabase
    .from("email_application_links")
    .upsert(
      { email_id: email.id, application_id: target.id, user_id: userId, linked_by: "auto_track" },
      { onConflict: "email_id,application_id" }
    )

  return true
}
