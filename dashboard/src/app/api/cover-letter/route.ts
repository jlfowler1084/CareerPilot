import { NextRequest, NextResponse } from "next/server"
import { BASE_RESUME } from "@/lib/base-resume"

const COVER_LETTER_SYSTEM_PROMPT = `You are a cover letter writing expert. You will receive a candidate's resume (or summary), a job title, a company name, and optionally a job description. Write a professional 3-4 paragraph cover letter that:

1. Opens with genuine enthusiasm for the specific role and company
2. Highlights 2-3 specific experiences from the resume that directly relate to the role's requirements
3. Demonstrates knowledge of the company and explains why the candidate is a great cultural/technical fit
4. Closes with a confident call to action

Rules:
- Reference SPECIFIC experiences from the resume — never fabricate
- Use a professional but warm tone — not robotic
- Keep it concise: 3-4 paragraphs, roughly 250-350 words
- Do NOT include placeholder brackets like [Your Name] — use the candidate's actual name from the resume
- Do NOT include a date header or address block — just the letter body
- Respond with ONLY a valid JSON object containing exactly one key: coverLetter (the full letter text)

If no specific job description is available (e.g. generic careers page), infer typical requirements from the job title and company, then write the letter based on those inferences.`

export async function POST(req: NextRequest) {
  try {
    const { title, company, url, jobDescription, resumeText } = await req.json()

    if (!title || !company) {
      return NextResponse.json(
        { error: "title and company are required" },
        { status: 400 }
      )
    }

    const resume = resumeText || BASE_RESUME

    if (jobDescription) {
      return await generateWithDescription(resume, jobDescription, title, company)
    }

    if (url) {
      return await generateWithWebSearch(resume, url, title, company)
    }

    // No JD or URL — generate based on title + company + resume
    return await generateWithDescription(resume, "", title, company)
  } catch (error) {
    console.error("Cover letter generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate cover letter" },
      { status: 500 }
    )
  }
}

async function generateWithDescription(
  resume: string,
  jobDescription: string,
  title: string,
  company: string
) {
  const jdSection = jobDescription
    ? `\n\nHere is the job description for "${title}" at ${company}:\n\n${jobDescription}`
    : `\n\nNo specific job description is available. Infer typical requirements for a "${title}" role at ${company}.`

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.MODEL_SONNET || "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: COVER_LETTER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the candidate's resume:\n\n${resume}${jdSection}\n\nPlease write a cover letter for this position.`,
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

async function generateWithWebSearch(
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
      max_tokens: 2000,
      system: COVER_LETTER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `I need you to write a cover letter for the "${title}" position at ${company}.\n\nFirst, use the web_search tool to find the job description at this URL: ${url}\n\nIf the URL is a generic careers page, infer typical requirements from the job title and company.\n\nThen write a cover letter using this resume:\n\n${resume}\n\nRespond with JSON containing a "coverLetter" key.`,
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

  // Strip markdown backticks
  const stripped = raw
    .replace(/^```(?:json)?\s*\n?/gim, "")
    .replace(/\n?```\s*$/gim, "")
    .trim()

  // Try JSON parse
  const parsed = tryParseJson(stripped)
  if (parsed) return NextResponse.json(parsed)

  // Try extracting JSON from mixed text
  const jsonMatch = stripped.match(/\{[\s\S]*"coverLetter"[\s\S]*\}/)
  if (jsonMatch) {
    const extracted = tryParseJson(jsonMatch[0])
    if (extracted) return NextResponse.json(extracted)
  }

  // Last resort: entire response as cover letter
  return NextResponse.json({
    coverLetter: stripped || raw || `Cover letter for ${title || "this role"} at ${company || "this company"} could not be generated.`,
  })
}

function tryParseJson(text: string): { coverLetter: string } | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed.coverLetter) {
      return { coverLetter: parsed.coverLetter }
    }
    return null
  } catch {
    return null
  }
}
