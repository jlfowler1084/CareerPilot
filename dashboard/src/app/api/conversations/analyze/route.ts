import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { conversationId } = await req.json()
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 })
    }

    // 1. Fetch the conversation
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, application:applications(id, title, company, job_description)")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (convError || !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    // 2. Fetch prior conversations for pattern detection (reduced from 20 to 10, only need topics)
    const { data: priorConversations } = await supabase
      .from("conversations")
      .select("id, topics")
      .eq("user_id", user.id)
      .neq("id", conversationId)
      .order("date", { ascending: false })
      .limit(10)

    // 3. Build prompt context
    const appContext = conversation.application
      ? `\n- Job: ${conversation.application.company} — ${conversation.application.title}${conversation.application.job_description ? `\n- Job Description: ${conversation.application.job_description.slice(0, 1500)}` : ""}`
      : ""

    const allTopics = priorConversations?.flatMap((c: { topics: string[] | null }) => c.topics || []).filter(Boolean) || []
    const uniqueTopics = [...new Set(allTopics)].slice(0, 30)
    const priorTopics = uniqueTopics.length
      ? `\n- Previous conversation topics: ${uniqueTopics.join(", ")}`
      : ""

    const prompt = `You are an interview coach analyzing a job search conversation. Given the notes, questions asked, and answers provided, generate a structured analysis.

Context:
- Conversation type: ${conversation.conversation_type}
- Title: ${conversation.title || "Untitled"}
- Notes: ${conversation.notes || "No notes provided"}
- Questions they asked: ${JSON.stringify(conversation.questions_asked || [])}
- Questions you asked: ${JSON.stringify(conversation.questions_you_asked || [])}${appContext}${priorTopics}

Return ONLY valid JSON with this structure:
{
  "topics": ["array", "of", "topic", "tags"],
  "strengths": ["Things you did well in this conversation"],
  "improvements": [
    {
      "area": "Brief description of what to improve",
      "your_answer": "What you said (paraphrased)",
      "coached_answer": "A better way to say it",
      "study_tip": "What to review to be better prepared"
    }
  ],
  "patterns": ["Recurring themes across conversations"],
  "study_recommendations": ["Specific topics to brush up on"],
  "follow_up_suggestions": ["Things to mention in follow-up"],
  "overall_assessment": "One paragraph summary"
}`

    // 4. Call Anthropic API with Haiku
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "API key not configured" }, { status: 500 })
    }

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!aiResp.ok) {
      console.error("Anthropic API error:", aiResp.status)
      return NextResponse.json({ success: false, error: "Analysis failed" }, { status: 502 })
    }

    const aiData = await aiResp.json()
    const text = aiData.content?.[0]?.text || ""

    // 5. Parse JSON from response (handle potential markdown wrapping)
    let analysis: Record<string, unknown> = {}
    try {
      // Try direct parse first
      analysis = JSON.parse(text)
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      }
    }

    // 6. Update conversation with analysis results
    const topics = Array.isArray(analysis.topics)
      ? (analysis.topics as string[]).filter((t: unknown) => typeof t === "string")
      : []

    const { error: updateError } = await supabase
      .from("conversations")
      .update({
        ai_analysis: analysis,
        topics: topics.length > 0 ? topics : conversation.topics,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Analysis update error:", updateError.message)
      return NextResponse.json({ success: false, error: "Failed to save analysis" }, { status: 500 })
    }

    return NextResponse.json({ success: true, analysis })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Conversation analyze error:", message)
    return NextResponse.json({ success: false, error: "Analysis failed" }, { status: 500 })
  }
}
