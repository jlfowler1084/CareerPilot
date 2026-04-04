import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { parseDiceResults } from "@/lib/parsers/dice"
import { searchDiceDirect } from "@/lib/mcp-client"
import { badGateway } from "@/lib/api-errors"

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

    // Call Dice MCP directly — no Claude API cost
    const rawText = await searchDiceDirect({
      keyword,
      location,
      radiusMiles: 50,
      jobsPerPage: 10,
      contractOnly: contractOnly || false,
    })

    const jobs = parseDiceResults(rawText)

    return NextResponse.json({
      jobs,
      source: "Dice",
      count: jobs.length,
    })
  } catch (error) {
    console.error("Dice search error:", error)
    return badGateway("Dice MCP service timeout", { service: "dice" })
  }
}
