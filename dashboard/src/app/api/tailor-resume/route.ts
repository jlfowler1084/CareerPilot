import { NextRequest, NextResponse } from "next/server"
import { BASE_RESUME } from "@/lib/base-resume"

const TAILOR_SYSTEM_PROMPT = `You are a resume tailoring expert. You will receive a candidate's resume and a job description. Respond with ONLY a valid JSON object containing exactly two keys: fitSummary (2-3 sentences analyzing how the candidate fits this role) and tailoredResume (the complete rewritten resume with bullets reordered to emphasize relevant experience). Rules: Never fabricate experience. Only reorder, re-emphasize, and naturally add keywords from the job description. Keep all sections: Professional Summary, Core Skills, Professional Experience, Education, Technical Knowledge.

CRITICAL: ALWAYS produce a complete tailored resume. Never respond saying you need more information, need to search more specifically, or cannot proceed. If no specific job description is available from a URL (e.g. it is a generic careers page), tailor the resume based on the job title, company name, and typical requirements for that role in the industry. When the job URL is a generic careers page, use the job title and company to infer likely requirements — draw on your knowledge of what companies in that industry typically look for in this type of role. Your output must ALWAYS be a fully formatted tailored resume in the JSON format described above — no exceptions, no clarifying questions, no requests for more info.`

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
      model: process.env.MODEL_SONNET || "claude-sonnet-4-20250514",
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
      model: process.env.MODEL_SONNET || "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: TAILOR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `I need you to tailor a resume for the "${title}" position at ${company}.\n\nFirst, use the web_search tool to find the job description at this URL: ${url}\n\nIf the URL is a generic careers page or does not contain a specific job posting, do NOT say you need more information. Instead, use the job title "${title}" and company "${company}" to infer typical requirements for this role and tailor the resume accordingly.\n\nThen tailor this base resume for the position:\n\n${resume}\n\nYou MUST return a complete tailored resume as JSON with "tailoredResume" and "fitSummary" keys. Never return a response without a full resume.`,
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

  // 1. Strip markdown backticks first (```json ... ``` or ``` ... ```)
  const stripped = raw
    .replace(/^```(?:json)?\s*\n?/gim, "")
    .replace(/\n?```\s*$/gim, "")
    .trim()

  // 2. Try JSON.parse on stripped content
  const fromStripped = tryParseJson(stripped)
  if (fromStripped) return NextResponse.json(fromStripped)

  // 3. Try extracting a JSON object from mixed text
  const jsonMatch = stripped.match(/\{[\s\S]*"tailoredResume"[\s\S]*\}/)
  if (jsonMatch) {
    const extracted = tryParseJson(jsonMatch[0])
    if (extracted) return NextResponse.json(extracted)
  }

  // 4. Heuristic: split on first "JOSEPH FOWLER" or "PROFESSIONAL SUMMARY"
  const splitPattern = /(JOSEPH FOWLER|PROFESSIONAL SUMMARY)/i
  const splitMatch = stripped.match(splitPattern)
  if (splitMatch?.index != null && splitMatch.index > 0) {
    const fitSummary = stripped.slice(0, splitMatch.index).trim()
    const tailoredResume = stripped.slice(splitMatch.index).trim()
    if (fitSummary && tailoredResume) {
      return NextResponse.json({ tailoredResume, fitSummary })
    }
  }

  // 5. Last resort: entire response as tailoredResume
  return NextResponse.json({
    tailoredResume: stripped || raw,
    fitSummary: `Resume tailored for ${title || "this role"} at ${company || "this company"}.`,
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
