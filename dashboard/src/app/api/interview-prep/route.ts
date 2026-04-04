import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import {
  buildPhoneScreenPrompt,
  buildInterviewPrompt,
  buildOfferPrompt,
  PREP_STAGES,
} from "@/lib/interview-prep-prompts"
import type { InterviewPrep, PrepStageKey } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { applicationId, stage } = await req.json()

    if (!applicationId || !stage || !PREP_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: "applicationId and valid stage (phone_screen, interview, offer) required" },
        { status: 400 }
      )
    }

    // Fetch application
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("id, title, company, url, salary_range, interview_prep, status, notes")
      .eq("id", applicationId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    // Fetch conversations for context
    const { data: conversations } = await supabase
      .from("conversations")
      .select("notes")
      .eq("application_id", applicationId)
      .eq("user_id", user.id)
      .order("date", { ascending: true })

    const existingPrep: InterviewPrep = app.interview_prep || {}
    const debriefs = existingPrep.debriefs || []
    const convos = conversations || []

    // Build stage-specific prompt
    let prompt: string
    const typedStage = stage as PrepStageKey
    switch (typedStage) {
      case "phone_screen":
        prompt = buildPhoneScreenPrompt(app, convos)
        break
      case "interview":
        prompt = buildInterviewPrompt(app, convos, debriefs)
        break
      case "offer":
        prompt = buildOfferPrompt(app, convos, debriefs)
        break
    }

    // Interview prep does NOT use web_search — that's for Company Brief only.
    // Prep uses existing context: resume summary, JD, company brief (if available), debriefs.
    // This keeps generation fast (<30s) and within Vercel's timeout limits.
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)

    let resp: Response
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.MODEL_SONNET || "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === "AbortError") {
        return NextResponse.json(
          { error: "Generation timed out after 90s. Click Retry to try again." },
          { status: 504 }
        )
      }
      throw err
    }
    clearTimeout(timeout)

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json(
        { error: `AI generation failed (${resp.status}): ${errBody.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const data = await resp.json()

    const textBlock = data.content?.find((c: { type: string }) => c.type === "text")
    const finalText = textBlock?.text || ""

    if (!finalText) {
      return NextResponse.json({ error: "No response generated" }, { status: 502 })
    }

    // Parse JSON from response
    const match = finalText.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: "Could not parse structured response" }, { status: 502 })
    }

    let content: unknown
    try {
      content = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: "Invalid JSON in response" }, { status: 502 })
    }

    // Store in interview_prep
    const updatedPrep: InterviewPrep = {
      ...existingPrep,
      [typedStage]: {
        generated_at: new Date().toISOString(),
        content,
      },
    }

    const { error: updateError } = await supabase
      .from("applications")
      .update({ interview_prep: updatedPrep })
      .eq("id", applicationId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Failed to store prep:", updateError.message)
      return NextResponse.json({ error: "Failed to store prep" }, { status: 500 })
    }

    return NextResponse.json({
      stage: typedStage,
      generated_at: updatedPrep[typedStage]!.generated_at,
      content,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Interview prep error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
