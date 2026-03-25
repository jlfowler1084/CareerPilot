import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { ClassificationResult } from "@/types/email"

const CLASSIFY_SYSTEM_PROMPT = `You are an email classifier for a job search dashboard. Classify the email into exactly one category and extract metadata.

Categories:
- recruiter_outreach: First-contact emails from recruiters or staffing agencies about a new role
- interview_request: Interview scheduling, confirmation, or logistics
- follow_up: Follow-ups on existing conversations ("checking in", "circling back", status updates)
- offer: Job offer communications
- job_alert: Automated job alert emails from job boards (Indeed, LinkedIn, Dice, etc.)
- rejection: Rejection or "moved forward with other candidates" notices
- irrelevant: Not related to job searching

Respond with valid JSON only, no other text:
{
  "category": "one of the categories above",
  "company": "company name or null",
  "role": "job title or null",
  "urgency": "high|medium|low",
  "summary": "1-2 sentence summary of the email"
}`

const FALLBACK_RESULT: ClassificationResult = {
  category: "irrelevant",
  company: null,
  role: null,
  urgency: "low",
  summary: "Classification failed",
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { from_email, from_name, subject, received_at, body } = await req.json()

    if (!body) {
      return NextResponse.json(FALLBACK_RESULT)
    }

    const truncatedBody = body.slice(0, 3000)

    const userMessage = `From: ${from_name || ""} <${from_email || "unknown"}>
Subject: ${subject || "(no subject)"}
Date: ${received_at || "unknown"}

${truncatedBody}`

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    })

    if (!resp.ok) {
      console.error("Anthropic API error:", resp.status)
      return NextResponse.json(FALLBACK_RESULT)
    }

    const data = await resp.json()
    const text = data.content?.[0]?.text || ""

    // Strip markdown fences if present
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

    const parsed = JSON.parse(jsonStr) as ClassificationResult
    // Validate category
    const validCategories = [
      "recruiter_outreach", "interview_request", "follow_up",
      "offer", "job_alert", "rejection", "irrelevant",
    ]
    if (!validCategories.includes(parsed.category)) {
      return NextResponse.json(FALLBACK_RESULT)
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Classification error:", error)
    return NextResponse.json(FALLBACK_RESULT)
  }
}
