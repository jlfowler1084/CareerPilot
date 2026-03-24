import { NextRequest, NextResponse } from "next/server"

type CalendarAction = "follow_up" | "phone_screen" | "interview" | "offer_deadline"

function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

function buildPrompt(
  action: CalendarAction,
  title: string,
  company: string,
  dateTime?: string,
  notes?: string
): string {
  const tz = "America/Indiana/Indianapolis"

  switch (action) {
    case "follow_up": {
      const followUpDate = addBusinessDays(new Date(), 5)
      const dateStr = followUpDate.toISOString().split("T")[0]
      return `Create a Google Calendar event:
- Title: "Follow up with ${company} about ${title}"
- Date: ${dateStr}
- Time: 9:00 AM
- Timezone: ${tz}
- Duration: 30 minutes
- Description: "Follow up on ${title} application at ${company}.${notes ? " Notes: " + notes : ""}"
Create the event and return the event ID.`
    }

    case "phone_screen": {
      if (!dateTime) return "Error: dateTime is required for phone_screen"
      return `Create 3 Google Calendar events for a phone screen:

1. Prep block:
   - Title: "PREP: ${title} Phone Screen — ${company}"
   - Start: 1 hour before ${dateTime}
   - Duration: 1 hour
   - Timezone: ${tz}
   - Description: "Prepare for phone screen. Review job description, company background, and talking points."

2. Phone screen:
   - Title: "Phone Screen: ${title} — ${company}"
   - Start: ${dateTime}
   - Duration: 30 minutes
   - Timezone: ${tz}
   - Description: "${notes || "Phone screen interview"}"

3. Debrief:
   - Title: "DEBRIEF: ${title} Phone Screen — ${company}"
   - Start: 30 minutes after ${dateTime}
   - Duration: 30 minutes
   - Timezone: ${tz}
   - Description: "Write down impressions, questions asked, and next steps."

Create all 3 events and return the event IDs.`
    }

    case "interview": {
      if (!dateTime) return "Error: dateTime is required for interview"
      const interviewDate = new Date(dateTime)
      const prepDate = new Date(interviewDate)
      prepDate.setDate(prepDate.getDate() - 1)
      const prepDateStr = prepDate.toISOString().split("T")[0]

      return `Create 3 Google Calendar events for an interview:

1. Prep block (day before):
   - Title: "PREP: ${title} Interview — ${company}"
   - Date: ${prepDateStr}
   - Time: 2:00 PM
   - Duration: 2 hours
   - Timezone: ${tz}
   - Description: "Deep prep for interview. Review job description, prepare STAR stories, research ${company}."

2. Interview:
   - Title: "Interview: ${title} — ${company}"
   - Start: ${dateTime}
   - Duration: 1 hour
   - Timezone: ${tz}
   - Description: "${notes || "Interview"}"

3. Debrief:
   - Title: "DEBRIEF: ${title} Interview — ${company}"
   - Start: 1 hour after ${dateTime}
   - Duration: 30 minutes
   - Timezone: ${tz}
   - Description: "Write down impressions, technical questions, behavioral questions, and next steps."

Create all 3 events and return the event IDs.`
    }

    case "offer_deadline": {
      if (!dateTime) return "Error: dateTime is required for offer_deadline"
      return `Create a Google Calendar event:
- Title: "DEADLINE: ${title} Offer — ${company}"
- Start: ${dateTime}
- Duration: 1 hour
- Timezone: ${tz}
- Description: "Offer decision deadline for ${title} at ${company}.${notes ? " Notes: " + notes : ""}"
- Add a reminder: 1 day before
Create the event and return the event ID.`
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, title, company, dateTime, notes } = await req.json()

    if (!action || !title || !company) {
      return NextResponse.json(
        { error: "action, title, and company are required" },
        { status: 400 }
      )
    }

    const validActions: CalendarAction[] = [
      "follow_up",
      "phone_screen",
      "interview",
      "offer_deadline",
    ]
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      )
    }

    const prompt = buildPrompt(action, title, company, dateTime, notes)
    if (prompt.startsWith("Error:")) {
      return NextResponse.json({ error: prompt }, { status: 400 })
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system:
          "You are a calendar scheduling assistant. Use the Google Calendar MCP tools to create events. After creating events, return a brief confirmation with the event details. Always include event IDs in your response.",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        mcp_servers: [
          {
            type: "url",
            url: "https://gcal.mcp.claude.com/mcp",
            name: "google_calendar",
          },
        ],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error("Calendar sync API error:", err)
      return NextResponse.json(
        { success: false, error: "Calendar service unavailable" },
        { status: 502 }
      )
    }

    const data = await resp.json()
    const allText =
      data.content
        ?.map(
          (b: {
            type: string
            text?: string
            content?: { text?: string }[]
          }) => {
            if (b.type === "text") return b.text || ""
            if (b.type === "mcp_tool_result")
              return (
                b.content?.map((c) => c.text || "").join("\n") || ""
              )
            return ""
          }
        )
        .join("\n") || ""

    // Try to extract event IDs from the response
    const eventIdMatches = allText.match(
      /[a-z0-9]{20,}(?=@google\.com)|[a-z0-9_]{20,}/g
    )
    const eventId = eventIdMatches?.[0] || null

    return NextResponse.json({
      success: true,
      eventId,
      details: allText,
    })
  } catch (error) {
    console.error("Calendar sync error:", error)
    return NextResponse.json(
      { success: false, error: "Calendar sync failed" },
      { status: 500 }
    )
  }
}
