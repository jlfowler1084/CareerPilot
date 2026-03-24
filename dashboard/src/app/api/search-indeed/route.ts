import { NextRequest, NextResponse } from "next/server"
import { parseIndeedResults } from "@/lib/parsers/indeed"

export async function POST(req: NextRequest) {
  try {
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
        model: "claude-sonnet-4-6",
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
      return NextResponse.json(
        { jobs: [], source: "Indeed", count: 0, error: "Search service unavailable" },
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
