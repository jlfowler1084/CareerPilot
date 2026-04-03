import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { body, subject, source } = await req.json() as {
    body: string; subject: string; source: string
  }

  if (!body || body.trim().length < 30) {
    return NextResponse.json({ jobs: [] })
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "Extract all individual job listings from this email. Return a JSON array: [{\"title\": \"\", \"company\": \"\", \"location\": \"\", \"salary\": \"\", \"description\": \"\"}]. If only one job is clearly described, return just that one. Do not fabricate — only extract what's explicitly mentioned. Return ONLY valid JSON, no other text.",
        messages: [
          {
            role: "user",
            content: `Subject: ${subject}\n\nBody:\n${body.slice(0, 2000)}`,
          },
        ],
      }),
    })

    if (!resp.ok) {
      console.error("[ai-extract] API error:", resp.status)
      return NextResponse.json({ jobs: [] })
    }

    const data = await resp.json()
    const text = data.content?.[0]?.type === "text" ? data.content[0].text : ""
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
    const jobs = JSON.parse(jsonStr)

    return NextResponse.json({
      jobs: Array.isArray(jobs) ? jobs.map((j: Record<string, string>) => ({
        title: j.title || "",
        company: j.company || "",
        location: j.location || undefined,
        salary: j.salary || undefined,
        description: j.description || undefined,
        source,
      })) : [],
    })
  } catch (err) {
    console.error("[ai-extract] Error:", err)
    return NextResponse.json({ jobs: [] })
  }
}
