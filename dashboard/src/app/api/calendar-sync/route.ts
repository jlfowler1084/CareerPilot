import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"

type CalendarAction = "follow_up" | "phone_screen" | "interview" | "offer_deadline"

const TZ = "America/Indiana/Indianapolis"

function getCalendar() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })
  return google.calendar({ version: "v3", auth: oauth2Client })
}

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

function toDateTime(date: Date): string {
  return date.toISOString()
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

async function createEvent(
  calendar: ReturnType<typeof google.calendar>,
  summary: string,
  start: Date,
  durationMinutes: number,
  description: string,
  reminders?: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> }
) {
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      description,
      start: { dateTime: toDateTime(start), timeZone: TZ },
      end: { dateTime: toDateTime(addMinutes(start, durationMinutes)), timeZone: TZ },
      ...(reminders ? { reminders } : {}),
    },
  })
  return res.data.id
}

async function handleFollowUp(
  calendar: ReturnType<typeof google.calendar>,
  title: string,
  company: string,
  notes?: string
) {
  const followUpDate = addBusinessDays(new Date(), 5)
  followUpDate.setHours(9, 0, 0, 0)

  const eventId = await createEvent(
    calendar,
    `Follow up with ${company} about ${title}`,
    followUpDate,
    30,
    `Follow up on ${title} application at ${company}.${notes ? " Notes: " + notes : ""}`
  )
  return { success: true, eventId }
}

async function handlePhoneScreen(
  calendar: ReturnType<typeof google.calendar>,
  title: string,
  company: string,
  dateTime: string,
  notes?: string
) {
  const screenStart = new Date(dateTime)
  const prepStart = addMinutes(screenStart, -60)
  const debriefStart = addMinutes(screenStart, 30)

  const [prepId, screenId, debriefId] = await Promise.all([
    createEvent(
      calendar,
      `PREP: ${title} Phone Screen — ${company}`,
      prepStart,
      60,
      "Prepare for phone screen. Review job description, company background, and talking points."
    ),
    createEvent(
      calendar,
      `Phone Screen: ${title} — ${company}`,
      screenStart,
      30,
      notes || "Phone screen interview"
    ),
    createEvent(
      calendar,
      `DEBRIEF: ${title} Phone Screen — ${company}`,
      debriefStart,
      30,
      "Write down impressions, questions asked, and next steps."
    ),
  ])

  return { success: true, eventId: screenId, allEventIds: [prepId, screenId, debriefId] }
}

async function handleInterview(
  calendar: ReturnType<typeof google.calendar>,
  title: string,
  company: string,
  dateTime: string,
  notes?: string
) {
  const interviewStart = new Date(dateTime)
  const prepDate = new Date(interviewStart)
  prepDate.setDate(prepDate.getDate() - 1)
  prepDate.setHours(14, 0, 0, 0)
  const debriefStart = addMinutes(interviewStart, 60)

  const [prepId, interviewId, debriefId] = await Promise.all([
    createEvent(
      calendar,
      `PREP: ${title} Interview — ${company}`,
      prepDate,
      120,
      `Deep prep for interview. Review job description, prepare STAR stories, research ${company}.`
    ),
    createEvent(
      calendar,
      `Interview: ${title} — ${company}`,
      interviewStart,
      60,
      notes || "Interview"
    ),
    createEvent(
      calendar,
      `DEBRIEF: ${title} Interview — ${company}`,
      debriefStart,
      30,
      "Write down impressions, technical questions, behavioral questions, and next steps."
    ),
  ])

  return { success: true, eventId: interviewId, allEventIds: [prepId, interviewId, debriefId] }
}

async function handleOfferDeadline(
  calendar: ReturnType<typeof google.calendar>,
  title: string,
  company: string,
  dateTime: string,
  notes?: string
) {
  const deadlineStart = new Date(dateTime)

  const eventId = await createEvent(
    calendar,
    `DEADLINE: ${title} Offer — ${company}`,
    deadlineStart,
    60,
    `Offer decision deadline for ${title} at ${company}.${notes ? " Notes: " + notes : ""}`,
    { useDefault: false, overrides: [{ method: "popup", minutes: 1440 }] }
  )
  return { success: true, eventId }
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

    if (action !== "follow_up" && !dateTime) {
      return NextResponse.json(
        { error: "dateTime is required for this action" },
        { status: 400 }
      )
    }

    const envCheck = {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
    }
    const missing = Object.entries(envCheck)
      .filter(([, v]) => !v)
      .map(([k]) => k)
    if (missing.length > 0) {
      console.error("Missing env vars:", missing.join(", "))
      return NextResponse.json(
        { error: `Google Calendar credentials not configured (missing: ${missing.join(", ")})` },
        { status: 500 }
      )
    }

    const calendar = getCalendar()

    let result
    switch (action as CalendarAction) {
      case "follow_up":
        result = await handleFollowUp(calendar, title, company, notes)
        break
      case "phone_screen":
        result = await handlePhoneScreen(calendar, title, company, dateTime, notes)
        break
      case "interview":
        result = await handleInterview(calendar, title, company, dateTime, notes)
        break
      case "offer_deadline":
        result = await handleOfferDeadline(calendar, title, company, dateTime, notes)
        break
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Calendar sync error:", error)
    return NextResponse.json(
      { success: false, error: "Calendar sync failed" },
      { status: 500 }
    )
  }
}
