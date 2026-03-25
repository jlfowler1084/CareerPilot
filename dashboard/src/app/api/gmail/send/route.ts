import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getGmailClient } from "@/lib/gmail/auth"

interface SendRequest {
  threadId: string
  to: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}

function buildMimeMessage({ to, subject, body, inReplyTo, references }: Omit<SendRequest, "threadId">): string {
  const lines: string[] = [
    `From: jlfowler1084@gmail.com`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
  ]

  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`)
  }
  if (references) {
    lines.push(`References: ${references}`)
  }

  lines.push("", body)
  return lines.join("\r\n")
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { threadId, to, subject, body, inReplyTo, references } = (await req.json()) as SendRequest

    if (!threadId || !to || !subject || !body) {
      return NextResponse.json(
        { error: "threadId, to, subject, and body are required" },
        { status: 400 }
      )
    }

    const mime = buildMimeMessage({ to, subject, body, inReplyTo, references })
    const raw = base64UrlEncode(mime)

    const gmail = getGmailClient()
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId },
    })

    return NextResponse.json({
      messageId: result.data.id,
      threadId: result.data.threadId,
    })
  } catch (error: unknown) {
    console.error("Gmail send error:", error)
    const message = error instanceof Error ? error.message : "Failed to send email"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
