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
        "anthropic-beta": "mcp-client-2025-04-04",
      },
      body: JSON.stringify({
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system:
          "You are a job search assistant. Use the Indeed MCP tool to search for jobs. Return the raw results exactly as the tool provides them. Do not add commentary.",
        messages: [
          {
            role: "user",
            content: `Search Indeed for "${keyword}" jobs in "${location}" in the US. Return all results.`,
          },
        ],
        mcp_servers: [
          {
            type: "url",
            url: "https://mcp.indeed.com/claude/mcp",
            name: "indeed",
          },
        ],
      }),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Indeed MCP upstream error:", resp.status, errBody.slice(0, 500))
      const isAuthError = errBody.includes("Authentication error") || errBody.includes("authorization")
      return NextResponse.json(
        {
          jobs: [],
          source: "Indeed",
          count: 0,
          error: isAuthError
            ? "Indeed requires authentication — configure INDEED_MCP_TOKEN in .env"
            : `Indeed service unavailable (${resp.status})`,
        },
        { status: 502 }
      )
    }

    const data = await resp.json()
    const allText =
      data.content
        ?.map((b: { type: string; text?: string; content?: { text?: string }[] }) => {
          if (b.type === "text") return b.text || ""
          if (b.type === "mcp_tool_result")
            return b.content?.map((c) => c.text || "").join("\n") || ""
          return ""
        })
        .join("\n") || ""

    const jobs = parseIndeedResults(allText)

    return NextResponse.json({
      jobs,
      source: "Indeed",
      count: jobs.length,
    })
  } catch (error) {
    console.error("Indeed search error:", error)
    return NextResponse.json(
      { jobs: [], source: "Indeed", count: 0, error: "MCP timeout" },
      { status: 200 }
    )
  }
}
