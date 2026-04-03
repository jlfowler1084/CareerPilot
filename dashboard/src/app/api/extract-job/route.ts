import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { config } from "dotenv"
import path from "path"

config({ path: path.resolve(process.cwd(), ".env.local") })

const EXTRACT_SYSTEM_PROMPT = `You are a job posting extraction expert. Given a URL, search for and read the job posting. Extract ALL available information. Respond with ONLY a JSON object containing: title (string), company (string), location (string or null), salary_range (string or null), job_type ("Full-time", "Part-time", or "Contract", or null), job_description (full requirements and responsibilities as text, or null), contact_name (string or null), contact_email (string or null), posted_date (ISO date string or null), key_requirements (array of strings), nice_to_haves (array of strings), fit_analysis (2-3 sentences on how a 20-year Windows/VMware/PowerShell/Azure systems engineer fits this role, or null). Do NOT wrap the JSON in markdown code blocks.`

function detectSource(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes("indeed.com")) return "Indeed"
    if (hostname.includes("dice.com")) return "Dice"
    if (hostname.includes("linkedin.com")) return "LinkedIn"
    if (hostname.includes("glassdoor.com")) return "Glassdoor"
    if (hostname.includes("ziprecruiter.com")) return "ZipRecruiter"
    if (hostname.includes("usajobs.gov")) return "USAJobs"
    if (hostname.endsWith(".gov")) return "Government"
    return "Company Site"
  } catch {
    return "Company Site"
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { url } = await req.json()

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      )
    }

    const source = detectSource(url)

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Find and extract all details from this job posting URL: ${url}`,
          },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5,
          },
        ],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error("Anthropic API error:", err)
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 }
      )
    }

    const data = await resp.json()
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text"
    )
    const raw = textBlock?.text || ""

    // Strip markdown backticks
    const stripped = raw
      .replace(/^```(?:json)?\s*\n?/gim, "")
      .replace(/\n?```\s*$/gim, "")
      .trim()

    // Try parsing as JSON
    let extracted = tryParseJson(stripped)

    // Try extracting JSON object from mixed text
    if (!extracted) {
      const jsonMatch = stripped.match(/\{[\s\S]*"title"[\s\S]*\}/)
      if (jsonMatch) {
        extracted = tryParseJson(jsonMatch[0])
      }
    }

    if (!extracted) {
      return NextResponse.json({
        success: true,
        source,
        data: {
          title: "",
          company: "",
          location: null,
          salary_range: null,
          job_type: null,
          job_description: stripped || null,
          contact_name: null,
          contact_email: null,
          posted_date: null,
          source,
          key_requirements: [],
          nice_to_haves: [],
          fit_analysis: null,
        },
      })
    }

    return NextResponse.json({
      success: true,
      source,
      data: {
        title: extracted.title || "",
        company: extracted.company || "",
        location: extracted.location || null,
        salary_range: extracted.salary_range || null,
        job_type: extracted.job_type || null,
        job_description: extracted.job_description || null,
        contact_name: extracted.contact_name || null,
        contact_email: extracted.contact_email || null,
        posted_date: extracted.posted_date || null,
        source,
        key_requirements: Array.isArray(extracted.key_requirements)
          ? extracted.key_requirements
          : [],
        nice_to_haves: Array.isArray(extracted.nice_to_haves)
          ? extracted.nice_to_haves
          : [],
        fit_analysis: extracted.fit_analysis || null,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Extract job error:", message)
    return NextResponse.json(
      { success: false, error: `Extraction failed: ${message}` },
      { status: 500 }
    )
  }
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === "object" && parsed !== null && parsed.title) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}
