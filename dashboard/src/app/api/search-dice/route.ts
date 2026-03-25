import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { parseDiceResults } from "@/lib/parsers/dice"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { keyword, location, contractOnly } = await req.json()

    if (!keyword || !location) {
      return NextResponse.json(
        { error: "keyword and location are required" },
        { status: 400 }
      )
    }

    const filterNote = contractOnly
      ? " Filter for contract positions only."
      : ""

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
          "You are a job search assistant. Use the Dice MCP tool to search for jobs. Return the raw tool results exactly as provided in JSON format. Do not add commentary or reformatting.",
        messages: [
          {
            role: "user",
            content: `Search Dice for "${keyword}" jobs near "${location}" within 50 miles. Return 10 results.${filterNote} Return the raw JSON.`,
          },
        ],
        mcp_servers: [
          {
            type: "url",
            url: "https://mcp.dice.com/mcp",
            name: "dice",
          },
        ],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json(
        { jobs: [], source: "Dice", count: 0, error: "Search service unavailable" },
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

    const jobs = parseDiceResults(allText)

    return NextResponse.json({
      jobs,
      source: "Dice",
      count: jobs.length,
    })
  } catch (error) {
    console.error("Dice search error:", error)
    return NextResponse.json(
      { jobs: [], source: "Dice", count: 0, error: "MCP timeout" },
      { status: 200 }
    )
  }
}
