import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { applicationId, jobDescription } = await req.json()

    // Fetch application details
    let appContext = ""
    if (applicationId) {
      const { data: app } = await supabase
        .from("applications")
        .select("title, company, notes, salary_range")
        .eq("id", applicationId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (app) {
        appContext = `Role: ${app.title} at ${app.company}\nNotes: ${app.notes || "none"}\nSalary: ${app.salary_range || "unknown"}`
      }

      // Fetch existing coaching sessions to avoid repeating questions and target weak areas
      const { data: sessions } = await supabase
        .from("interview_coaching")
        .select("ai_analysis, improvements, overall_score")
        .eq("application_id", applicationId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5)

      if (sessions && sessions.length > 0) {
        const weakAreas = sessions
          .flatMap((s) => {
            const improvements = s.improvements as Array<{ area: string }> | null
            return improvements?.map((i) => i.area) || []
          })
          .filter(Boolean)
        if (weakAreas.length > 0) {
          appContext += `\n\nPrevious coaching identified these weak areas (target some questions here): ${[...new Set(weakAreas)].join(", ")}`
        }
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
    }

    const prompt = `Generate 5 interview questions for a ${appContext ? appContext : "systems administrator/engineer"} position.
Mix of behavioral, technical, and situational.
${jobDescription ? `Job description:\n${jobDescription}\n` : ""}
${appContext ? `Context:\n${appContext}\n` : ""}
If previous coaching identified weak areas, include questions targeting those areas.
Return JSON: { "questions": [{ "question": "...", "type": "behavioral|technical|situational", "difficulty": "easy|medium|hard", "targets": "what this tests" }] }
Return ONLY valid JSON. No markdown, no backticks, no preamble.`

    // Sonnet: contextual question generation requires reasoning
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_SONNET || "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI generation failed" }, { status: 502 })
    }

    const data = await resp.json()
    const textBlock = data.content?.find((c: { type: string }) => c.type === "text")
    const finalText = textBlock?.text || ""

    const match = finalText.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: "Could not parse response" }, { status: 502 })
    }

    let result: { questions: unknown[] }
    try {
      result = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: "Invalid JSON in response" }, { status: 502 })
    }

    return NextResponse.json({ questions: result.questions || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Practice generation error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
