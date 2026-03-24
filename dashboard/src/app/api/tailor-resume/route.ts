import { NextRequest, NextResponse } from "next/server"
import { BASE_RESUME } from "@/lib/base-resume"

const TAILOR_SYSTEM_PROMPT = `You are a resume optimization expert. You will be given a base resume and a target job description. Produce a tailored version of the resume as plain text and a brief fit summary.

Rules:
- NEVER fabricate experience or add skills the candidate doesn't have.
- ONLY reorder bullets within each role to put the most relevant first.
- Adjust the Professional Summary to emphasize what this job cares about.
- Naturally weave in keywords from the job description into existing bullet points where they genuinely apply.
- Keep the same section structure and formatting as the original resume.

You must respond with ONLY a JSON object, no markdown backticks, no preamble. The JSON must have exactly two keys: fitSummary (a 2-3 sentence analysis of how well the candidate fits this role) and tailoredResume (the complete tailored resume text with all sections).`

export async function POST(req: NextRequest) {
  try {
    const { title, company, url, jobDescription, baseResume } = await req.json()

    if (!title || !company) {
      return NextResponse.json(
        { error: "title and company are required" },
        { status: 400 }
      )
    }

    const resume = baseResume || BASE_RESUME

    // If we have a job description, call Claude directly. Otherwise use web_search to fetch it.
    if (jobDescription) {
      return await tailorWithDescription(resume, jobDescription, title, company)
    }

    if (url) {
      return await tailorWithWebSearch(resume, url, title, company)
    }

    return NextResponse.json(
      { error: "Either jobDescription or url is required" },
      { status: 400 }
    )
  } catch (error) {
    console.error("Resume tailoring error:", error)
    return NextResponse.json(
      { error: "Failed to tailor resume" },
      { status: 500 }
    )
  }
}

async function tailorWithDescription(
  resume: string,
  jobDescription: string,
  title: string,
  company: string
) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: TAILOR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the base resume:\n\n${resume}\n\nHere is the job description for "${title}" at ${company}:\n\n${jobDescription}\n\nPlease tailor the resume for this position.`,
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

  return parseResponse(await resp.json(), title, company)
}

async function tailorWithWebSearch(
  resume: string,
  url: string,
  title: string,
  company: string
) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: TAILOR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `I need you to tailor a resume for the "${title}" position at ${company}.\n\nFirst, use the web_search tool to find the job description at this URL: ${url}\n\nThen tailor this base resume for the position:\n\n${resume}\n\nReturn the result as JSON with "tailoredResume" and "fitSummary" keys.`,
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
    const err = await resp.text()
    console.error("Anthropic API error:", err)
    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 502 }
    )
  }

  return parseResponse(await resp.json(), title, company)
}

function parseResponse(
  data: { content: Array<{ type: string; text?: string }> },
  title?: string,
  company?: string
) {
  const textBlock = data.content?.find(
    (b: { type: string }) => b.type === "text"
  )
  const raw = textBlock?.text || ""

  // 1. Try JSON.parse() directly
  const direct = tryParseJson(raw)
  if (direct) return NextResponse.json(direct)

  // 2. Strip markdown backticks (```json ... ```) and retry
  const stripped = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "")
  if (stripped !== raw) {
    const fromStripped = tryParseJson(stripped)
    if (fromStripped) return NextResponse.json(fromStripped)
  }

  // 3. Heuristic: split on first "PROFESSIONAL SUMMARY" or "JOSEPH FOWLER"
  const splitPattern = /(PROFESSIONAL SUMMARY|JOSEPH FOWLER)/i
  const splitMatch = raw.match(splitPattern)
  if (splitMatch?.index != null && splitMatch.index > 0) {
    const fitSummary = raw.slice(0, splitMatch.index).trim()
    const tailoredResume = raw.slice(splitMatch.index).trim()
    if (fitSummary && tailoredResume) {
      return NextResponse.json({ tailoredResume, fitSummary })
    }
  }

  // 4. Last resort: entire response as tailoredResume
  return NextResponse.json({
    tailoredResume: raw,
    fitSummary: `Resume tailored for ${title || "this role"} at ${company || "this company"}`,
  })
}

function tryParseJson(
  text: string
): { tailoredResume: string; fitSummary: string } | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed.tailoredResume || parsed.fitSummary) {
      return {
        tailoredResume: parsed.tailoredResume || "",
        fitSummary: parsed.fitSummary || "",
      }
    }
    return null
  } catch {
    return null
  }
}
