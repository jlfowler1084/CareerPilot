import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { searchDiceDirect } from "@/lib/mcp-client"
import { parseDiceResults } from "@/lib/parsers/dice"
import { badRequest, badGateway } from "@/lib/api-errors"

// Dice MCP enforces a global 200-request/min rate limit.
// When hit, the MCP error message contains one of these phrases.
const RATE_LIMIT_SIGNALS = ["rate limit", "too many requests", "429", "throttl"]

export function isRateLimitError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return RATE_LIMIT_SIGNALS.some((s) => lower.includes(s))
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { keyword?: unknown; location?: unknown; contractOnly?: unknown; source?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest("Invalid JSON body")
  }

  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : ""
  const location = typeof body.location === "string" ? body.location.trim() : "remote"
  const contractOnly = body.contractOnly === true

  if (!keyword) {
    return badRequest("keyword is required")
  }

  try {
    const rawText = await searchDiceDirect({
      keyword,
      location: location || "remote",
      radiusMiles: 50,
      jobsPerPage: 10,
      contractOnly,
    })

    const partials = parseDiceResults(rawText)
    // Attach profileId/profileLabel as empty — ad-hoc results are not profile-bound
    const jobs = partials.map((j) => ({ ...j, profileId: "", profileLabel: "Ad-hoc" }))

    return NextResponse.json({ jobs, source: "Dice", count: jobs.length })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (isRateLimitError(msg)) {
      return NextResponse.json(
        { error: "Dice search rate limit reached. Please wait a minute and try again.", detail: msg },
        { status: 503 }
      )
    }
    console.error("[search-adhoc] Dice MCP error:", msg)
    return badGateway("Dice MCP service error", { service: "dice", detail: msg })
  }
}
