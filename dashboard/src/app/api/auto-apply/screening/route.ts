import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { question } = await req.json() as { question: string }
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question string required" }, { status: 400 })
    }

    // Load all screening answers for this user
    const { data: answers, error: loadError } = await supabase
      .from("screening_answers")
      .select("*")
      .eq("user_id", user.id)
      .order("priority", { ascending: false })

    if (loadError || !answers || answers.length === 0) {
      return NextResponse.json({ answer: null, confidence: "none" })
    }

    const questionLower = question.toLowerCase()

    // Phase 1: Regex matching (highest confidence)
    for (const ans of answers) {
      try {
        const pattern = new RegExp(ans.question_pattern, "i")
        if (pattern.test(question)) {
          return NextResponse.json({
            answer: ans.answer_value,
            type: ans.answer_type,
            confidence: "high",
            category: ans.category,
          })
        }
      } catch {
        // Invalid regex — fall through to fuzzy matching
      }
    }

    // Phase 2: Fuzzy substring matching (medium confidence)
    // Check if key words from the pattern appear in the question
    for (const ans of answers) {
      const patternWords = ans.question_pattern
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w: string) => w.length > 3) // Only meaningful words

      if (patternWords.length === 0) continue

      const matchCount = patternWords.filter((w: string) => questionLower.includes(w)).length
      const matchRatio = matchCount / patternWords.length

      if (matchRatio >= 0.6) {
        return NextResponse.json({
          answer: ans.answer_value,
          type: ans.answer_type,
          confidence: "medium",
          category: ans.category,
        })
      }
    }

    // No match found
    return NextResponse.json({ answer: null, confidence: "none" })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
