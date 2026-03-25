import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getGmailClient } from "@/lib/gmail/auth"
import { extractBody } from "@/lib/gmail/parse"

interface ThreadMessage {
  gmail_id: string
  from_email: string
  from_name: string | null
  to_email: string | null
  subject: string | null
  date: string
  body: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { thread_id } = await req.json()
    if (!thread_id) {
      return NextResponse.json({ error: "thread_id is required" }, { status: 400 })
    }

    const gmail = getGmailClient()

    const thread = await gmail.users.threads.get({
      userId: "me",
      id: thread_id,
      format: "full",
    })

    const messages: ThreadMessage[] = (thread.data.messages || []).map((msg) => {
      const headers = msg.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ""

      const fromRaw = getHeader("From")
      const fromNameMatch = fromRaw.match(/^([^<]+)</)
      const fromEmailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([^\s]+@[^\s]+)/)

      const date = msg.internalDate
        ? new Date(parseInt(msg.internalDate)).toISOString()
        : new Date(getHeader("Date")).toISOString()

      return {
        gmail_id: msg.id || "",
        from_email: fromEmailMatch?.[1]?.trim() || fromRaw,
        from_name: fromNameMatch?.[1]?.trim() || null,
        to_email: getHeader("To") || null,
        subject: getHeader("Subject") || null,
        date,
        body: extractBody(msg.payload as any),
      }
    })

    // Sort chronologically (oldest first for reading flow)
    messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Gmail thread fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch thread", messages: [] },
      { status: 502 }
    )
  }
}
