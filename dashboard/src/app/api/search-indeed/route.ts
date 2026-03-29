import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { parseIndeedResults } from "@/lib/parsers/indeed"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { keyword, location } = await req.json()

    if (!keyword || !location) {
      return NextResponse.json(
        { error: "keyword and location are required" },
        { status: 400 }
      )
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system:
          "You are a job search assistant. Use the web_search tool to search Indeed for job listings. Search site:indeed.com for the given keywords and location. Return results as a JSON array with objects containing these exact fields: title, company, location, salary (or \"Not listed\"), url, job_type, posted_date. Return ONLY the raw JSON array, no markdown fences, no commentary, no explanation.",
        messages: [
          {
            role: "user",
            content: `Search Indeed (site:indeed.com) for "${keyword}" jobs in "${location}" in the US. Find current job listings and return them as a JSON array.`,
          },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 3,
          },
        ],
      }),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Indeed web search upstream error:", resp.status, errBody.slice(0, 500))
      return NextResponse.json(
        {
          jobs: [],
          source: "Indeed",
          count: 0,
          error: `Indeed service unavailable (${resp.status})`,
        },
        { status: 502 }
      )
    }

    const data = await resp.json()
    const allText =
      data.content
        ?.filter((b: { type: string }) => b.type === "text")
        .map((b: { text?: string }) => b.text || "")
        .join("\n") || ""

    const jobs = parseIndeedResults(allText)

    return NextResponse.json({
      jobs,
      source: "Indeed",
      count: jobs.length,
    })
  } catch (error) {
    console.error("Indeed web search error:", error)
    return NextResponse.json({
      jobs: [],
      source: "Indeed",
      count: 0,
      info: "Indeed search temporarily unavailable",
    })
  }
}
