import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { parseJsonResponse } from "@/lib/json-utils"
import { getUserName } from "@/lib/user-profile"
import type { Json } from "@/types/database.types"

function buildDebriefAnalysisPrompt(name: string) {
  const safeName = (name || '').replace(/[`$\\]/g, '')
  return `You are an interview performance analyst. Analyze the candidate's structured debrief notes and identify patterns, strengths, and areas for improvement.

The candidate is ${safeName}, a systems administrator/engineer with 20+ years of experience specializing in PowerShell, VMware, Splunk, Active Directory, and Azure.

Respond with raw JSON only. No markdown formatting, no code fences, no preamble.

Return a JSON object with:
{
  "patterns": ["Recurring themes across interviews — be specific, e.g. 'Azure AD questions appeared in 3 of 5 interviews'"],
  "strengths": ["Things consistently done well — e.g. 'PowerShell automation stories land well'"],
  "improvement_areas": ["Specific gaps to address — e.g. 'Struggled with DNS troubleshooting scenario questions'"],
  "study_recommendations": ["Topics to review before next round — e.g. 'Review DHCP failover and split-scope configs'"],
  "next_round_focus": "Summary of what to emphasize in the next interview based on this debrief"
}

Rules:
- Be specific and actionable ("Study DHCP failover" not "Review networking")
- Look for patterns across the full debrief history, not just the current one
- Reference concrete topics, technologies, and question types
- If there are prior debriefs, compare this round to previous rounds

Return ONLY valid JSON. No markdown, no backticks, no preamble.`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { debriefId } = await req.json()
    if (!debriefId) {
      return NextResponse.json({ error: "debriefId is required" }, { status: 400 })
    }

    // Fetch the current debrief
    const { data: currentDebrief, error: debriefError } = await supabase
      .from("debriefs")
      .select("*")
      .eq("id", debriefId)
      .eq("user_id", user.id)
      .single()

    if (debriefError || !currentDebrief) {
      return NextResponse.json({ error: "Debrief not found" }, { status: 404 })
    }

    // Fetch application context
    const { data: app } = await supabase
      .from("applications")
      .select("title, company")
      .eq("id", currentDebrief.application_id)
      .maybeSingle()

    // Fetch all prior debriefs for THIS application (for round-over-round progression)
    const { data: appDebriefs } = await supabase
      .from("debriefs")
      .select("stage, went_well, was_hard, do_differently, key_takeaways, topics_covered, ai_analysis, created_at")
      .eq("application_id", currentDebrief.application_id)
      .eq("user_id", user.id)
      .neq("id", debriefId)
      .order("created_at", { ascending: true })

    // Fetch all debriefs across ALL applications (for cross-app patterns)
    const { data: allDebriefs } = await supabase
      .from("debriefs")
      .select("stage, went_well, was_hard, topics_covered, key_takeaways, ai_analysis, created_at, application_id")
      .eq("user_id", user.id)
      .neq("id", debriefId)
      .order("created_at", { ascending: true })

    // Build context for the AI
    const totalDebriefCount = (allDebriefs?.length || 0) + 1
    const contextParts: string[] = [
      `Current application: ${app?.title || "Unknown"} at ${app?.company || "Unknown"}`,
      `This is debrief ${totalDebriefCount} across all applications.`,
      "",
      "--- Current Debrief ---",
      `Stage: ${currentDebrief.stage}`,
      `What went well: ${currentDebrief.went_well || "Not provided"}`,
      `What was hard: ${currentDebrief.was_hard || "Not provided"}`,
      `What I'd do differently: ${currentDebrief.do_differently || "Not provided"}`,
      `Key takeaways: ${(currentDebrief.key_takeaways as string[] || []).join(", ") || "None"}`,
      `Topics covered: ${(currentDebrief.topics_covered as string[] || []).join(", ") || "None"}`,
    ]

    if (appDebriefs && appDebriefs.length > 0) {
      contextParts.push("", "--- Prior Debriefs for This Application ---")
      for (const d of appDebriefs) {
        contextParts.push(
          `\n${d.stage} (${new Date(d.created_at).toLocaleDateString()}):`,
          `  Went well: ${d.went_well || "N/A"}`,
          `  Was hard: ${d.was_hard || "N/A"}`,
          `  Topics: ${(d.topics_covered as string[] || []).join(", ") || "N/A"}`,
        )
      }
    }

    if (allDebriefs && allDebriefs.length > 0) {
      const allTopics = allDebriefs
        .flatMap((d) => (d.topics_covered as string[]) || [])
      const topicCounts: Record<string, number> = {}
      for (const t of allTopics) {
        topicCounts[t] = (topicCounts[t] || 0) + 1
      }
      const sortedTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([topic, count]) => `${topic} (${count}x)`)

      if (sortedTopics.length > 0) {
        contextParts.push(
          "",
          "--- Cross-Application Topic Frequency ---",
          sortedTopics.join(", ")
        )
      }

      const hardItems = allDebriefs
        .filter((d) => d.was_hard)
        .map((d) => d.was_hard as string)
      if (hardItems.length > 0) {
        contextParts.push(
          "",
          "--- Recurring Challenges Across All Interviews ---",
          hardItems.join("\n")
        )
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
    }

    // Haiku: structured pattern extraction from debrief notes
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: buildDebriefAnalysisPrompt(getUserName(user)),
        messages: [{ role: "user", content: contextParts.join("\n") }],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 })
    }

    const data = await resp.json()

    if (data.stop_reason === "max_tokens") {
      console.error("Debrief analysis truncated")
      return NextResponse.json({ error: "AI response truncated" }, { status: 502 })
    }

    const textBlock = data.content?.find((c: { type: string }) => c.type === "text")
    const finalText = textBlock?.text || ""

    if (!finalText) {
      return NextResponse.json({ error: "No response generated" }, { status: 502 })
    }

    let analysis: Record<string, unknown>
    try {
      analysis = parseJsonResponse(finalText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse AI response"
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // Update the debrief row with ai_analysis
    const { error: updateError } = await supabase
      .from("debriefs")
      .update({
        ai_analysis: analysis as unknown as Json,
        model_used: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        generation_cost_cents: 0,
      })
      .eq("id", debriefId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Failed to update debrief with analysis:", updateError.message)
      return NextResponse.json({ error: "Failed to store analysis" }, { status: 500 })
    }

    return NextResponse.json({ analysis }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Debrief analyze error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
