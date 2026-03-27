import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

interface JobDetailsRequest {
  url: string
  source: "Indeed" | "Dice"
  jobId?: string
  summary?: string
  title?: string
  company?: string
  location?: string
  salary?: string
  type?: string
  posted?: string
}

interface JobDetailsResponse {
  title: string
  company: string
  location: string
  salary: string
  description: string
  requirements: string[]
  niceToHaves: string[]
  applyUrl: string
  source: string
  cached: boolean
  type?: string
  posted?: string
}

const CACHE_TTL_DAYS = 7

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: JobDetailsRequest = await req.json()
    if (!body.url || !body.source) {
      return NextResponse.json(
        { error: "url and source are required" },
        { status: 400 }
      )
    }

    // --- Check cache ---
    const staleDate = new Date(
      Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    const { data: cached } = await supabase
      .from("job_details_cache")
      .select("details, fetched_at")
      .eq("job_url", body.url)
      .gte("fetched_at", staleDate)
      .single()

    if (cached) {
      return NextResponse.json({ ...cached.details, cached: true })
    }

    // --- Fetch details based on source ---
    let details: JobDetailsResponse

    if (body.source === "Indeed") {
      details = await fetchIndeedDetails(body)
    } else {
      // Dice: use data already available from search results
      details = buildDiceDetails(body)
    }

    // --- Upsert to cache ---
    await supabase.from("job_details_cache").upsert(
      {
        user_id: user.id,
        job_url: body.url,
        source: body.source,
        job_id: body.jobId || null,
        details,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "job_url" }
    )

    return NextResponse.json({ ...details, cached: false })
  } catch (error) {
    console.error("Job details error:", error)
    return NextResponse.json(
      { error: "Failed to fetch job details" },
      { status: 500 }
    )
  }
}

// --- Indeed: fetch full JD via Claude API + Indeed MCP ---
async function fetchIndeedDetails(
  body: JobDetailsRequest
): Promise<JobDetailsResponse> {
  const fallback: JobDetailsResponse = {
    title: body.title || "",
    company: body.company || "",
    location: body.location || "",
    salary: body.salary || "",
    description: "",
    requirements: [],
    niceToHaves: [],
    applyUrl: body.url,
    source: "Indeed",
    cached: false,
    type: body.type,
    posted: body.posted,
  }

  try {
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
        system: `You are a job details extractor. Use the Indeed MCP tool to get full job details for the given URL or job ID. Then return a JSON object with these fields:
- title: string
- company: string
- location: string
- salary: string
- description: string (the full job description text)
- requirements: string[] (extracted required qualifications)
- niceToHaves: string[] (extracted preferred/nice-to-have qualifications)
- applyUrl: string (direct application link if available, otherwise the job URL)

Return ONLY valid JSON, no markdown fences, no commentary.`,
        messages: [
          {
            role: "user",
            content: `Get the full job details for this Indeed job. URL: ${body.url}${body.jobId ? `, Job ID: ${body.jobId}` : ""}. Return the structured JSON.`,
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
      console.error("Indeed MCP error:", resp.status)
      return fallback
    }

    const data = await resp.json()

    // Extract text from Claude response
    const allText =
      data.content
        ?.map(
          (b: {
            type: string
            text?: string
            content?: { text?: string }[]
          }) => {
            if (b.type === "text") return b.text || ""
            if (b.type === "mcp_tool_result")
              return b.content?.map((c) => c.text || "").join("\n") || ""
            return ""
          }
        )
        .join("\n") || ""

    // Try to parse JSON from response
    const jsonMatch = allText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback

    const parsed = JSON.parse(jsonMatch[0])
    return {
      title: parsed.title || fallback.title,
      company: parsed.company || fallback.company,
      location: parsed.location || fallback.location,
      salary: parsed.salary || fallback.salary,
      description: parsed.description || "",
      requirements: Array.isArray(parsed.requirements)
        ? parsed.requirements
        : [],
      niceToHaves: Array.isArray(parsed.niceToHaves)
        ? parsed.niceToHaves
        : [],
      applyUrl: parsed.applyUrl || body.url,
      source: "Indeed",
      cached: false,
      type: body.type,
      posted: body.posted,
    }
  } catch (error) {
    console.error("Indeed details fetch error:", error)
    return fallback
  }
}

// --- Dice: use data from search results (no additional API call) ---
function buildDiceDetails(body: JobDetailsRequest): JobDetailsResponse {
  return {
    title: body.title || "",
    company: body.company || "",
    location: body.location || "",
    salary: body.salary || "",
    description: body.summary || "",
    requirements: [],
    niceToHaves: [],
    applyUrl: body.url,
    source: "Dice",
    cached: false,
    type: body.type,
    posted: body.posted,
  }
}
