import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

async function extractTopics(notes: string): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !notes.trim()) return []

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system:
          "Extract 3-7 short topic tags from conversation notes. Return ONLY a JSON array of lowercase strings. Example: [\"salary negotiation\", \"team culture\", \"python experience\"]. No other text.",
        messages: [{ role: "user", content: notes }],
      }),
    })

    if (!resp.ok) return []

    const data = await resp.json()
    const text = data.content?.[0]?.text || ""
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) return parsed.filter((t: unknown) => typeof t === "string")
    }
  } catch {
    // Topic extraction is best-effort
  }
  return []
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const applicationId = searchParams.get("applicationId")
    const search = searchParams.get("search")
    const type = searchParams.get("type")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    let query = supabase
      .from("conversations")
      .select("*, application:applications(id, title, company)")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1)

    if (applicationId) {
      query = query.eq("application_id", applicationId)
    }

    if (type) {
      query = query.eq("conversation_type", type)
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,notes.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error("Conversations fetch error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ conversations: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Conversations GET error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { application_id, conversation_type, date } = body

    if (!application_id || !conversation_type || !date) {
      return NextResponse.json(
        { error: "application_id, conversation_type, and date are required" },
        { status: 400 }
      )
    }

    // Extract topics from notes if provided
    let topics: string[] = body.topics || []
    if (body.notes && topics.length === 0) {
      topics = await extractTopics(body.notes)
    }

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        application_id,
        conversation_type,
        date,
        title: body.title || null,
        people: body.people || [],
        duration_minutes: body.duration_minutes || null,
        notes: body.notes || null,
        questions_asked: body.questions_asked || [],
        questions_you_asked: body.questions_you_asked || [],
        action_items: body.action_items || [],
        topics,
        sentiment: body.sentiment || null,
        transcript_url: body.transcript_url || null,
      })
      .select("*, application:applications(id, title, company)")
      .single()

    if (error) {
      console.error("Conversation create error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ conversation: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Conversations POST error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
