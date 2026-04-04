import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { sanitizeJsonResponse } from "@/lib/json-utils"
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

const BATCH_SYSTEM_PROMPT = `You are an email classifier for a job search dashboard. Classify EACH email into exactly one category and extract metadata.

Categories:
- recruiter_outreach: First-contact emails from recruiters or staffing agencies about a new role
- interview_request: Interview scheduling, confirmation, or logistics
- follow_up: Follow-ups on existing conversations ("checking in", "circling back", status updates)
- offer: Job offer communications
- job_alert: Automated job alert emails from job boards (Indeed, LinkedIn, Dice, etc.)
- rejection: Rejection or "moved forward with other candidates" notices
- irrelevant: Not related to job searching

Return a JSON array with one object per email, in the SAME ORDER as the input. Each object must have:
{
  "category": "one of the categories above",
  "company": "company name or null",
  "role": "job title or null",
  "urgency": "high|medium|low",
  "summary": "1-2 sentence summary of the email"
}

Respond with ONLY the JSON array, no other text.`

const FALLBACK_RESULT: ClassificationResult = {
  category: "irrelevant",
  company: null,
  role: null,
  urgency: "low",
  summary: "Classification failed",
}

const VALID_CATEGORIES = [
  "recruiter_outreach", "interview_request", "follow_up",
  "offer", "job_alert", "rejection", "irrelevant",
]

interface EmailInput {
  from_email?: string
  from_name?: string
  subject?: string
  received_at?: string
  body?: string
}

function formatEmail(e: EmailInput): string {
  return `From: ${e.from_name || ""} <${e.from_email || "unknown"}>
Subject: ${e.subject || "(no subject)"}
Date: ${e.received_at || "unknown"}

${(e.body || "").slice(0, 3000)}`
}

function validateResult(parsed: ClassificationResult): ClassificationResult {
  if (!VALID_CATEGORIES.includes(parsed.category)) {
    return FALLBACK_RESULT
  }
  return parsed
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()

    // Batch mode: { emails: [...] }
    if (Array.isArray(body.emails) && body.emails.length > 0) {
      return handleBatch(body.emails)
    }

    // Single mode: { from_email, from_name, subject, received_at, body }
    return handleSingle(body)
  } catch (error) {
    console.error("Classification error:", error)
    return NextResponse.json(FALLBACK_RESULT)
  }
}

async function handleSingle(email: EmailInput): Promise<NextResponse> {
  if (!email.body) {
    return NextResponse.json(FALLBACK_RESULT)
  }

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
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: formatEmail(email) }],
    }),
  })

  if (!resp.ok) {
    console.error("Anthropic API error:", resp.status)
    return NextResponse.json(FALLBACK_RESULT)
  }

  const data = await resp.json()
  const text = data.content?.[0]?.text || ""

  try {
    const parsed = JSON.parse(sanitizeJsonResponse(text)) as ClassificationResult
    return NextResponse.json(validateResult(parsed))
  } catch {
    return NextResponse.json(FALLBACK_RESULT)
  }
}

async function handleBatch(emails: EmailInput[]): Promise<NextResponse> {
  // Cap batch size to prevent prompt overflow
  const batch = emails.slice(0, 20)

  const emailBlocks = batch.map((e, i) =>
    `=== EMAIL ${i + 1} ===\n${formatEmail(e)}`
  ).join("\n\n")

  // ~150 output tokens per email
  const maxTokens = Math.min(batch.length * 200, 4096)

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: BATCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Classify these ${batch.length} emails:\n\n${emailBlocks}` }],
    }),
  })

  if (!resp.ok) {
    console.error("Anthropic batch classify error:", resp.status)
    return NextResponse.json({ results: batch.map(() => FALLBACK_RESULT) })
  }

  const data = await resp.json()
  const text = data.content?.[0]?.text || ""

  try {
    const sanitized = sanitizeJsonResponse(text)
    const match = sanitized.match(/\[[\s\S]*\]/)
    if (!match) throw new Error("No array found")

    const parsed = JSON.parse(match[0]) as ClassificationResult[]
    if (!Array.isArray(parsed)) throw new Error("Not an array")

    // Pad or trim to match input length, validate each result
    const results = batch.map((_, i) =>
      parsed[i] ? validateResult(parsed[i]) : FALLBACK_RESULT
    )
    return NextResponse.json({ results })
  } catch {
    console.error("Batch parse failed, returning fallbacks")
    return NextResponse.json({ results: batch.map(() => FALLBACK_RESULT) })
  }
}
