import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 })
    }

    const { data: conversations, error } = await (supabase
      .from("conversations")
      .select("*, application:applications(id, title, company)")
      .eq("user_id", user.id)
      .order("date", { ascending: false }) as unknown as Promise<{ data: any[] | null; error: any }>)

    if (error) {
      console.error("Pattern fetch error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({
        patterns: {
          recurring_questions: [],
          strongest_topics: [],
          weak_areas: [],
          this_week: "No conversations logged yet. Start tracking your interactions to see patterns emerge.",
        },
      })
    }

    // Build a summary for Claude
    const summary = conversations.map((c) => ({
      type: c.conversation_type,
      title: c.title,
      company: c.application?.company || "Unknown",
      date: c.date,
      topics: c.topics,
      sentiment: c.sentiment,
      questions_asked: c.questions_asked,
      questions_you_asked: c.questions_you_asked,
      notes_preview: c.notes ? c.notes.slice(0, 300) : null,
    }))

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_SONNET || "claude-sonnet-4-6",
        max_tokens: 2000,
        system: `You analyze job search conversation patterns. Return ONLY valid JSON with this exact structure:
{
  "recurring_questions": [{"question": "...", "companies": ["..."], "count": N}],
  "strongest_topics": [{"topic": "...", "avg_sentiment": N, "count": N}],
  "weak_areas": [{"area": "...", "suggestion": "..."}],
  "this_week": "1-2 sentence summary of recent conversation activity"
}
Analyze recurring questions asked by interviewers across companies, topics that correlate with positive sentiment and advancement, areas of consistent weakness, and a brief this-week summary. If data is sparse, provide reasonable inferences and note the limited data. No text outside the JSON.`,
        messages: [
          {
            role: "user",
            content: `Here are ${conversations.length} conversations from my job search:\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error("Anthropic API error:", err)
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 })
    }

    const data = await resp.json()
    const text = data.content?.[0]?.text || ""

    // Parse JSON from response
    const stripped = text
      .replace(/^```(?:json)?\s*\n?/gim, "")
      .replace(/\n?```\s*$/gim, "")
      .trim()

    try {
      const patterns = JSON.parse(stripped)
      return NextResponse.json({ patterns })
    } catch {
      // Try extracting JSON object
      const match = stripped.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          const patterns = JSON.parse(match[0])
          return NextResponse.json({ patterns })
        } catch {
          // Fall through
        }
      }
      return NextResponse.json({
        patterns: {
          recurring_questions: [],
          strongest_topics: [],
          weak_areas: [],
          this_week: stripped || "Unable to analyze patterns at this time.",
        },
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Patterns error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
