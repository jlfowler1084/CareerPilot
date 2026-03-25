import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getGmailClient } from "@/lib/gmail/auth"
import { extractDomain } from "@/lib/gmail/parse"

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { since, page_token } = await req.json()
    if (!since) {
      return NextResponse.json({ error: "since is required" }, { status: 400 })
    }

    const gmail = getGmailClient()

    // Convert ISO timestamp to Gmail query format (epoch seconds)
    const afterEpoch = Math.floor(new Date(since).getTime() / 1000)

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: `after:${afterEpoch}`,
      maxResults: 20,
      pageToken: page_token || undefined,
    })

    const messageIds = listResponse.data.messages || []
    const emails = []

    for (const msg of messageIds) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      })

      const headers = detail.data.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ""

      const fromRaw = getHeader("From")
      const fromNameMatch = fromRaw.match(/^([^<]+)</)
      const fromEmailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([^\s]+@[^\s]+)/)

      const fromEmail = fromEmailMatch?.[1]?.trim() || fromRaw
      const fromName = fromNameMatch?.[1]?.trim() || null

      emails.push({
        gmail_id: msg.id!,
        thread_id: msg.threadId || null,
        from_email: fromEmail,
        from_name: fromName,
        from_domain: extractDomain(fromEmail),
        to_email: getHeader("To") || null,
        subject: getHeader("Subject") || null,
        received_at: detail.data.internalDate
          ? new Date(parseInt(detail.data.internalDate)).toISOString()
          : new Date(getHeader("Date")).toISOString(),
      })
    }

    return NextResponse.json({
      emails,
      next_page_token: listResponse.data.nextPageToken || null,
    })
  } catch (error) {
    console.error("Gmail scan error:", error)
    return NextResponse.json(
      { error: "Gmail scan failed", emails: [], next_page_token: null },
      { status: 502 }
    )
  }
}
