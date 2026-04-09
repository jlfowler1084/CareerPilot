import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { analyzeFillersAndPatterns } from "@/lib/coaching/patterns"
import { parseJsonResponse } from "@/lib/json-utils"
import { getUserName } from "@/lib/user-profile"
import type { Json } from "@/types/database.types"

function buildCoachingSystemPrompt(name: string) {
  const safeName = (name || '').replace(/[`$\\]/g, '')
  return `You are an interview performance coach analyzing a candidate's interview performance. The candidate is ${safeName}, a systems administrator/engineer with 20+ years of experience.

Analyze the provided interview content. Respond with raw JSON only. No markdown formatting, no code fences, no preamble, no explanation.

Return a JSON object with:
{
  "summary": "2-3 sentence overall assessment",
  "overall_score": <1-10>,
  "strong_points": ["specific strength 1", "specific strength 2"],
  "question_analyses": [
    {
      "question": "the question that was asked (infer from context)",
      "your_answer": "what the candidate said (quoted/paraphrased)",
      "score": <1-10>,
      "feedback": "specific, actionable feedback",
      "coached_answer": "rewritten version that's concise, specific, uses STAR format where appropriate, and demonstrates competence",
      "issues": ["rambling", "hedging", "vague", "off-topic", "no-star", "technical-gap"]
    }
  ],
  "improvements": [
    {
      "area": "category of improvement",
      "your_answer": "what they said",
      "coached_answer": "better version",
      "tip": "one-line actionable tip"
    }
  ],
  "top_3_focus_areas": ["most important thing to work on", "second", "third"]
}

Rules:
- Be direct and specific — no generic advice like 'be more confident'
- Every coached answer must use real details from ${safeName}'s actual experience (PowerShell, VMware 700+ VMs, Splunk dashboards, SolarWinds, Active Directory, Azure)
- Flag answers that sound good but lack substance
- If a question is about a skill gap, coach how to acknowledge it honestly while showing initiative
- STAR format: Situation, Task, Action, Result — flag when missing
- Keep coached answers under 60 seconds speaking time (~150 words)

Return ONLY valid JSON. No markdown, no backticks, no preamble.`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { applicationId, sessionType, rawInput, jobDescription } = await req.json()

    if (!sessionType || !rawInput) {
      return NextResponse.json(
        { error: "sessionType and rawInput are required" },
        { status: 400 }
      )
    }

    // Step 1: Rules-based pattern analysis (NO AI)
    const patterns = analyzeFillersAndPatterns(rawInput)

    // Step 2: Build Claude prompt with context
    const contextParts: string[] = [
      `Session type: ${sessionType}`,
      `\nCandidate's input:\n${rawInput}`,
      `\nAutomated pattern detection (pre-computed, no AI):\n${JSON.stringify(patterns, null, 2)}`,
    ]
    if (jobDescription) {
      contextParts.push(`\nJob description context:\n${jobDescription}`)
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
    }

    // Haiku: structured extraction from interview transcript (classification-level task)
    // 8192 max_tokens: full transcripts (~15K input tokens) produce ~7K output tokens for detailed per-question analysis
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
          model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
          max_tokens: 8192,
          system: buildCoachingSystemPrompt(getUserName(user)),
          messages: [{ role: "user", content: contextParts.join("\n") }],
        }),
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === "AbortError") {
        return NextResponse.json(
          { error: "Analysis timed out after 90s. Try a shorter transcript or click Retry." },
          { status: 504 }
        )
      }
      throw err
    }
    clearTimeout(timeout)

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 })
    }

    const data = await resp.json()

    // Check for truncation before attempting to parse
    if (data.stop_reason === "max_tokens") {
      console.error("Claude response truncated: used", data.usage?.output_tokens, "output tokens")
      return NextResponse.json(
        { error: "AI response was truncated — the transcript may be too long for analysis. Try a shorter excerpt." },
        { status: 502 }
      )
    }

    const textBlock = data.content?.find((c: { type: string }) => c.type === "text")
    const finalText = textBlock?.text || ""

    if (!finalText) {
      return NextResponse.json({ error: "No response generated" }, { status: 502 })
    }

    // Parse JSON from response (sanitize LLM artifacts first)
    let analysis: Record<string, unknown>
    try {
      analysis = parseJsonResponse(finalText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse AI response"
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // Step 5: Merge AI analysis with pattern analysis
    const overallScore = typeof analysis.overall_score === "number" ? analysis.overall_score : 5
    const strongPoints = Array.isArray(analysis.strong_points) ? analysis.strong_points : []
    const improvements = Array.isArray(analysis.improvements) ? analysis.improvements : []

    // Step 6: Insert into interview_coaching table
    const aiAnalysisJson = {
      summary: analysis.summary || "",
      question_analyses: analysis.question_analyses || [],
      top_3_focus_areas: analysis.top_3_focus_areas || [],
    } as unknown as Json

    const { data: session, error: insertError } = await supabase
      .from("interview_coaching")
      .insert({
        application_id: applicationId || null,
        user_id: user.id,
        session_type: sessionType,
        raw_input: rawInput,
        ai_analysis: aiAnalysisJson,
        overall_score: overallScore,
        strong_points: strongPoints as unknown as Json,
        improvements: improvements as unknown as Json,
        patterns_detected: patterns as unknown as Json,
      })
      .select()
      .single()

    if (insertError) {
      console.error("Failed to store coaching session:", insertError.message)
      return NextResponse.json({ error: "Failed to store coaching session" }, { status: 500 })
    }

    // Step 7: Also persist to debriefs table for history/export (CAR-127)
    // Only for debrief session types with a linked application
    if (sessionType === "debrief" && applicationId) {
      const modelUsed = process.env.MODEL_HAIKU || "claude-haiku-4-5-20241022"

      // Look up application stage for context
      const { data: app } = await supabase
        .from("applications")
        .select("status")
        .eq("id", applicationId)
        .maybeSingle()

      const { data: debrief, error: debriefError } = await supabase
        .from("debriefs")
        .insert({
          application_id: applicationId,
          user_id: user.id,
          stage: app?.status || "interview",
          ai_analysis: {
            ...analysis,
            overall_score: overallScore,
            strong_points: strongPoints,
            improvements,
            patterns_detected: patterns,
          } as unknown as Json,
          model_used: modelUsed,
          generation_cost_cents: 0,
        })
        .select()
        .single()

      if (debriefError) {
        // Log but don't fail — the coaching session was already saved
        console.error("Failed to store debrief record:", debriefError.message)
      }

      // Return both the coaching session and the debrief record
      return NextResponse.json({ ...session, debrief: debrief || null }, { status: 201 })
    }

    return NextResponse.json(session, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Coaching analyze error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const applicationId = req.nextUrl.searchParams.get("applicationId")
    if (!applicationId) {
      return NextResponse.json({ error: "applicationId required" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("interview_coaching")
      .select("*")
      .eq("application_id", applicationId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to fetch coaching sessions:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Coaching sessions fetch error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
