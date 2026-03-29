import { getModelConfig } from '../model-config'
import { RESUME_SUMMARY } from '../resume-context'

// ── Types ───────────────────────────────────────────────────────────

export interface CompanyBriefData {
  overview: string
  culture: string
  recent_news: string[]
  glassdoor_summary: string
  tech_stack: string[]
  headcount: string
  funding_stage: string
  why_good_fit: string
  red_flags: string
  questions_to_research: string[]
}

export interface GenerationResult {
  briefData: CompanyBriefData
  modelUsed: string
  costCents: number
}

// ── Cost estimation ─────────────────────────────────────────────────

/**
 * Estimate cost in cents from Anthropic API usage.
 * Haiku 4.5 pricing: $1.00/MTok input, $5.00/MTok output
 * Returns integer cents (rounded up).
 */
function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 100 // $1/MTok = 100 cents/MTok
  const outputCost = (outputTokens / 1_000_000) * 500 // $5/MTok = 500 cents/MTok
  return Math.ceil(inputCost + outputCost)
}

// ── Generator ───────────────────────────────────────────────────────

export async function generateCompanyBrief(
  companyName: string,
  jobTitle: string,
  jobDescription: string | null
): Promise<GenerationResult> {
  const config = getModelConfig('company_brief')

  const systemPrompt = `You are a company research analyst helping a job seeker prepare for applications and interviews.

CANDIDATE PROFILE:
${RESUME_SUMMARY}

YOUR TASK: Research "${companyName}" thoroughly using web search. The candidate is applying for a "${jobTitle}" role there.

Return ONLY a valid JSON object (no markdown, no backticks, no commentary) with this exact structure:
{
  "overview": "What the company does, size, headquarters, industry. 2-3 sentences.",
  "culture": "Work environment, values, remote/hybrid/onsite policy, employee sentiment. 2-3 sentences.",
  "recent_news": ["Array of 3-5 recent headlines or developments about the company"],
  "glassdoor_summary": "Glassdoor rating if findable, common praise and complaints. If not available, state that.",
  "tech_stack": ["Array of known technologies, tools, platforms, cloud providers they use"],
  "headcount": "Approximate employee count and growth trajectory (growing/stable/shrinking)",
  "funding_stage": "Public/private, recent funding rounds, approximate revenue if known",
  "why_good_fit": "Based on the candidate's profile above, explain specifically why their experience aligns with this company and role. Reference specific skills and experience.",
  "red_flags": "Any concerns: recent layoffs, bad press, financial trouble, high turnover. Say 'None identified' if clean.",
  "questions_to_research": ["Array of 3-5 specific things the candidate should dig into before an interview"]
}

IMPORTANT RULES:
- Use web search to find current, accurate information
- If you can't find info for a field, provide your best assessment and note the uncertainty
- The "why_good_fit" field MUST reference the candidate's specific skills from their profile
- The "tech_stack" should focus on infrastructure/systems technologies relevant to the role
- Keep each field concise but substantive
- Return ONLY the JSON object — no other text`

  const userMessage = jobDescription
    ? `Research ${companyName} for a "${jobTitle}" position.\n\nHere is the job description for additional context:\n\n${jobDescription}`
    : `Research ${companyName} for a "${jobTitle}" position.`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
    }),
  })

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => 'Unknown error')
    throw new Error(
      `Anthropic API error (${resp.status}): ${errorBody.slice(0, 200)}`
    )
  }

  const data = await resp.json()

  // Extract text content from response (may have multiple content blocks due to web search)
  const textContent = (data.content || [])
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { type: string; text: string }) => block.text)
    .join('')

  // Strip citation tags and markdown fencing from response
  const cleanJson = textContent
    .replace(/<cite[^>]*>|<\/cite>/g, '')
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  let briefData: CompanyBriefData
  try {
    briefData = JSON.parse(cleanJson)
  } catch {
    // If JSON parse fails, try to extract JSON from the response
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      briefData = JSON.parse(jsonMatch[0])
    } else {
      throw new Error('Failed to parse company brief JSON from AI response')
    }
  }

  // Validate and fill defaults for any missing fields
  briefData = {
    overview: briefData.overview || 'No overview available',
    culture: briefData.culture || 'No culture information found',
    recent_news: Array.isArray(briefData.recent_news)
      ? briefData.recent_news
      : [],
    glassdoor_summary:
      briefData.glassdoor_summary || 'No Glassdoor data found',
    tech_stack: Array.isArray(briefData.tech_stack) ? briefData.tech_stack : [],
    headcount: briefData.headcount || 'Unknown',
    funding_stage: briefData.funding_stage || 'Unknown',
    why_good_fit: briefData.why_good_fit || 'Unable to assess fit',
    red_flags: briefData.red_flags || 'None identified',
    questions_to_research: Array.isArray(briefData.questions_to_research)
      ? briefData.questions_to_research
      : [],
  }

  const costCents = estimateCostCents(
    data.usage?.input_tokens || 0,
    data.usage?.output_tokens || 0
  )

  return {
    briefData,
    modelUsed: config.model,
    costCents,
  }
}
