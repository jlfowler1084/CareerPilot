import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getGmailClient } from "@/lib/gmail/auth"
import { extractBody } from "@/lib/gmail/parse"

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { gmail_id } = await req.json()
    if (!gmail_id) {
      return NextResponse.json({ error: "gmail_id is required" }, { status: 400 })
    }

    const gmail = getGmailClient()

    const message = await gmail.users.messages.get({
      userId: "me",
      id: gmail_id,
      format: "full",
    })

    const body = extractBody(message.data.payload as any)

    return NextResponse.json({ body })
  } catch (error) {
    console.error("Gmail message fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch email body", body: "" },
      { status: 502 }
    )
  }
}
