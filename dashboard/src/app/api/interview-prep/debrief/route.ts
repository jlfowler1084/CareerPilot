import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { InterviewPrep, ApplicationStatus, ConversationType } from "@/types"

function statusToConversationType(status: ApplicationStatus): ConversationType {
  switch (status) {
    case "phone_screen": return "phone"
    case "interview": return "video"
    default: return "note"
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
    const {
      applicationId, round, rating, questions_asked,
      went_well, challenging, takeaways,
      interviewer_name, interviewer_role,
    } = body

    if (!applicationId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "applicationId and rating (1-5) required" },
        { status: 400 }
      )
    }

    // Fetch application
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("id, interview_prep, status")
      .eq("id", applicationId)
      .eq("user_id", user.id)
      .single()

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    // Append debrief
    const existingPrep: InterviewPrep = app.interview_prep || {}
    const now = new Date().toISOString()
    const debrief = {
      round: round || (existingPrep.debriefs?.length || 0) + 1,
      date: now,
      rating,
      questions_asked: questions_asked || "",
      went_well: went_well || "",
      challenging: challenging || "",
      takeaways: takeaways || "",
      interviewer_name: interviewer_name || "",
      interviewer_role: interviewer_role || "",
    }
    const updatedPrep: InterviewPrep = {
      ...existingPrep,
      debriefs: [...(existingPrep.debriefs || []), debrief],
    }

    // Update application
    const { error: updateError } = await supabase
      .from("applications")
      .update({ interview_prep: updatedPrep })
      .eq("id", applicationId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Failed to store debrief:", updateError.message)
      return NextResponse.json({ error: "Failed to store debrief" }, { status: 500 })
    }

    // Dual-write: create conversation record
    const noteParts: string[] = []
    if (went_well) noteParts.push(`Went well: ${went_well}`)
    if (challenging) noteParts.push(`Challenging: ${challenging}`)
    if (takeaways) noteParts.push(`Takeaways: ${takeaways}`)

    const { error: convoError } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        application_id: applicationId,
        conversation_type: statusToConversationType(app.status),
        date: now,
        title: `Round ${debrief.round} Debrief`,
        notes: noteParts.join("\n\n") || null,
        sentiment: rating,
        people: interviewer_name
          ? [{ name: interviewer_name, role: interviewer_role || undefined }]
          : [],
      })

    if (convoError) {
      console.error("Failed to create conversation from debrief:", convoError.message)
      // Non-fatal — debrief was saved, conversation creation failed
    }

    return NextResponse.json({ debriefs: updatedPrep.debriefs }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Debrief error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
