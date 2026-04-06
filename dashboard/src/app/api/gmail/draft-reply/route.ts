import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getGmailClient } from "@/lib/gmail/auth"
import { extractBody } from "@/lib/gmail/parse"
import { getUserName, getUserEmail } from "@/lib/user-profile"

function buildDraftSystemPrompt(name: string) {
  return `You are drafting a professional email reply for ${name}, a systems administrator and engineer with 20+ years of experience in Windows Server, Active Directory, VMware, PowerShell, Azure, and Microsoft 365. You are helping him respond to job-search-related emails.

Rules:
- Match the tone and formality of the conversation
- Keep replies concise — under 150 words unless the situation requires more
- If this is about scheduling, confirm availability and suggest times
- If this is recruiter outreach, express professional interest and ask 1-2 relevant questions about the role
- If this is a follow-up, acknowledge and provide a clear next step
- If this is an offer discussion, be professional and measured
- Never invent facts about ${name}'s experience — only reference real skills
- Sign off as '${name}' or the first name depending on conversation tone
- Do NOT include a subject line in the body

Respond with ONLY the email body text. No preamble, no explanation.`
}

interface ThreadMessageParsed {
  from_email: string
  from_name: string | null
  date: string
  body: string
  messageId: string | null
  references: string | null
  subject: string | null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { threadId, emailId, tone = "professional" } = await req.json()
    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 })
    }

    const toneGuidance: Record<string, string> = {
      professional: "Be professional, measured, and thorough.",
      friendly: "Be warm, conversational, and approachable while remaining professional.",
      brief: "Be extremely concise — 2-3 sentences max. Get to the point fast.",
    }

    // Step 1: Fetch full thread from Gmail
    const gmail = getGmailClient()
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    })

    const rawMessages = thread.data.messages || []
    if (rawMessages.length === 0) {
      return NextResponse.json({ error: "Thread has no messages" }, { status: 404 })
    }

    // Step 2: Parse all messages
    const messages: ThreadMessageParsed[] = rawMessages.map((msg) => {
      const headers = msg.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || null

      const fromRaw = getHeader("From") || ""
      const fromNameMatch = fromRaw.match(/^([^<]+)</)
      const fromEmailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([^\s]+@[^\s]+)/)

      const date = msg.internalDate
        ? new Date(parseInt(msg.internalDate)).toISOString()
        : new Date(getHeader("Date") || "").toISOString()

      return {
        from_email: fromEmailMatch?.[1]?.trim() || fromRaw,
        from_name: fromNameMatch?.[1]?.trim() || null,
        date,
        body: extractBody(msg.payload as any),
        messageId: getHeader("Message-ID") || getHeader("Message-Id"),
        references: getHeader("References"),
        subject: getHeader("Subject"),
      }
    })

    // Sort oldest first
    messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Step 3: Build Claude prompt
    const latestMsg = messages[messages.length - 1]
    const threadFormatted = messages.map((msg, i) => {
      const isLatest = i === messages.length - 1
      return `--- Message ${i + 1} (from: ${msg.from_email}, date: ${msg.date}) ---${isLatest ? " [LATEST - reply to this]" : ""}\n${msg.body}`
    }).join("\n\n")

    const userContent = `Here is the email thread (oldest first):\n\n${threadFormatted}\n\nTone: ${toneGuidance[tone] || toneGuidance.professional}\n\nDraft a reply to the latest message.`

    // Step 4: Call Anthropic API
    // Sonnet: requires nuanced tone-matching and professional writing
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_SONNET || "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: buildDraftSystemPrompt(getUserName(user)),
        messages: [{ role: "user", content: userContent }],
      }),
    })

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text()
      console.error("Anthropic API error:", anthropicResp.status, errText)
      return NextResponse.json({ error: "Failed to generate draft" }, { status: 502 })
    }

    const anthropicData = await anthropicResp.json()
    const draftBody = anthropicData.content?.[0]?.text || ""

    // Step 5: Build reply metadata
    const originalSubject = messages[0].subject || "(no subject)"
    const suggestedSubject = originalSubject.startsWith("Re:")
      ? originalSubject
      : `Re: ${originalSubject}`

    // Determine reply-to address (the sender of the latest message, not the user)
    const myEmail = getUserEmail(user)
    const replyTo = myEmail && latestMsg.from_email.toLowerCase() === myEmail.toLowerCase()
      ? messages.find((m) => m.from_email.toLowerCase() !== myEmail.toLowerCase())?.from_email || latestMsg.from_email
      : latestMsg.from_email

    // Thread continuity headers
    const inReplyTo = latestMsg.messageId || ""
    const refParts = [latestMsg.references, latestMsg.messageId].filter(Boolean)
    const referencesHeader = refParts.join(" ")

    return NextResponse.json({
      draftBody,
      suggestedSubject,
      to: replyTo,
      inReplyTo,
      references: referencesHeader,
    })
  } catch (error: unknown) {
    console.error("Draft reply error:", error)
    const message = error instanceof Error ? error.message : "Failed to generate draft reply"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
