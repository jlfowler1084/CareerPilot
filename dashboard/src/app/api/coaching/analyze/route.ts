import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { analyzeFillersAndPatterns } from "@/lib/coaching/patterns"
import type { Json } from "@/types/database.types"

const COACHING_SYSTEM_PROMPT = `You are an interview performance coach analyzing a candidate's interview performance. The candidate is Joseph Fowler, a systems administrator/engineer with 20+ years of experience.

Analyze the provided interview content and return a JSON object with:
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
- Every coached answer must use real details from Joseph's actual experience (PowerShell, VMware 700+ VMs, Splunk dashboards, SolarWinds, Active Directory, Azure)
- Flag answers that sound good but lack substance
- If a question is about a skill gap, coach how to acknowledge it honestly while showing initiative
- STAR format: Situation, Task, Action, Result — flag when missing
- Keep coached answers under 60 seconds speaking time (~150 words)

Return ONLY valid JSON. No markdown, no backticks, no preamble.`

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

    // Sonnet: deep comprehension + nuanced professional rewriting
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_SONNET || "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: COACHING_SYSTEM_PROMPT,
        messages: [{ role: "user", content: contextParts.join("\n") }],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 })
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

    let analysis: Record<string, unknown>
    try {
      analysis = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: "Invalid JSON in response" }, { status: 502 })
    }

    // Step 5: Merge AI analysis with pattern analysis
    const overallScore = typeof analysis.overall_score === "number" ? analysis.overall_score : 5
    const strongPoints = Array.isArray(analysis.strong_points) ? analysis.strong_points : []
    const improvements = Array.isArray(analysis.improvements) ? analysis.improvements : []

    // Step 6: Insert into interview_coaching table
    const { data: session, error: insertError } = await supabase
      .from("interview_coaching")
      .insert({
        application_id: applicationId || null,
        user_id: user.id,
        session_type: sessionType,
        raw_input: rawInput,
        ai_analysis: {
          summary: analysis.summary || "",
          question_analyses: analysis.question_analyses || [],
          top_3_focus_areas: analysis.top_3_focus_areas || [],
        } as unknown as Json,
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

    return NextResponse.json(session, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Coaching analyze error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
