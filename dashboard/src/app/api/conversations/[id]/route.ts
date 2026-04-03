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
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
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
    // Best-effort
  }
  return []
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("*, application:applications(id, title, company)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ conversation: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Conversation GET error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()

    // Re-extract topics if notes changed and no explicit topics provided
    if (body.notes && !body.topics) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("notes")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (existing && existing.notes !== body.notes) {
        body.topics = await extractTopics(body.notes)
      }
    }

    const { data, error } = await supabase
      .from("conversations")
      .update(body)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*, application:applications(id, title, company)")
      .maybeSingle()

    if (error) {
      console.error("Conversation update error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ conversation: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Conversation PATCH error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Conversation delete error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Conversation DELETE error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
