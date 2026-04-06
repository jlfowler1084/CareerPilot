import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { analyzeFillersAndPatterns } from "@/lib/coaching/patterns"
import { parseJsonResponse } from "@/lib/json-utils"
import { getUserName } from "@/lib/user-profile"

function buildEvalSystemPrompt(name: string) {
  return `You are an interview performance coach evaluating a single answer from ${name}, a systems administrator/engineer with 20+ years of experience.

Analyze the answer to the given question and return a JSON object with:
{
  "question": "the question",
  "your_answer": "what the candidate said",
  "score": <1-10>,
  "feedback": "specific, actionable feedback",
  "coached_answer": "rewritten version that's concise, specific, uses STAR format where appropriate",
  "issues": ["rambling", "hedging", "vague", "off-topic", "no-star", "technical-gap"]
}

Rules:
- Be direct and specific — no generic advice
- Coached answers should use real details from ${name}'s experience (PowerShell, VMware 700+ VMs, Splunk dashboards, SolarWinds, Active Directory, Azure)
- STAR format: Situation, Task, Action, Result — flag when missing for behavioral questions
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

    const { question, answer, jobDescription } = await req.json()

    if (!question || !answer) {
      return NextResponse.json(
        { error: "question and answer are required" },
        { status: 400 }
      )
    }

    // Step 1: Rules-based pattern analysis (NO AI)
    const patterns = analyzeFillersAndPatterns(answer)

    const contextParts = [
      `Question: ${question}`,
      `\nCandidate's answer:\n${answer}`,
      `\nAutomated pattern detection:\n${JSON.stringify(patterns, null, 2)}`,
    ]
    if (jobDescription) {
      contextParts.push(`\nJob description context:\n${jobDescription}`)
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
    }

    // Sonnet: deep comprehension for evaluating interview answers
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
        system: buildEvalSystemPrompt(getUserName(user)),
        messages: [{ role: "user", content: contextParts.join("\n") }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI evaluation failed" }, { status: 502 })
    }

    const data = await resp.json()
    const textBlock = data.content?.find((c: { type: string }) => c.type === "text")
    const finalText = textBlock?.text || ""

    let evaluation: Record<string, unknown>
    try {
      evaluation = parseJsonResponse(finalText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse AI response"
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    return NextResponse.json({ evaluation, patterns })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Practice evaluate error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
