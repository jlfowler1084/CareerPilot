import { getModelConfig } from '../model-config'
import { RESUME_SUMMARY } from '../resume-context'
import { sanitizeJsonResponse } from '@/lib/json-utils'

// ── Types ───────────────────────────────────────────────────────────

export interface InterviewPrepData {
  likely_questions: Array<{
    question: string
    category: 'behavioral' | 'technical' | 'situational' | 'culture_fit'
    suggested_approach: string
  }>
  talking_points: string[]
  gaps_to_address: Array<{
    gap: string
    mitigation: string
  }>
  questions_to_ask: Array<{
    question: string
    why: string
  }>
  career_narrative_angle: string
  stage_specific_tips: string[]
}

export interface GenerationResult {
  prepData: InterviewPrepData
  modelUsed: string
  costCents: number
}

// ── Cost estimation ─────────────────────────────────────────────────

/**
 * Estimate cost in cents from Anthropic API usage.
 * Sonnet pricing: $3/MTok input, $15/MTok output
 * Returns integer cents (rounded up).
 */
function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 300 // $3/MTok = 300 cents/MTok
  const outputCost = (outputTokens / 1_000_000) * 1500 // $15/MTok = 1500 cents/MTok
  return Math.ceil(inputCost + outputCost)
}

// ── Stage-specific prompt helpers ───────────────────────────────────

function getStagePrompt(stage: string): string {
  switch (stage) {
    case 'phone_screen':
      return `Generate prep for a PHONE SCREEN stage interview.

Focus on:
- Company overview talking points — what the candidate should know going in
- Role fit summary — how to succinctly explain why they're a great match
- 10 likely phone screen questions: 5 behavioral (teamwork, communication, conflict resolution, adaptability, problem-solving) and 5 light technical (core skills check, tools/platforms familiarity)
- 5 questions the candidate should ask (team structure, tech stack, growth plans, remote policy, next steps)
- How to frame 20+ years at one employer as growth and progression, not stagnation
- Salary expectations talking points if asked early

Generate 10 likely_questions total with suggested approaches.`

    case 'technical':
      return `Generate prep for a TECHNICAL INTERVIEW stage.

Focus on:
- Deep technical questions based on the job description requirements
- PowerShell scripting scenarios (automation frameworks, module design, error handling, CI/CD integration)
- Azure/Entra ID scenarios (VM provisioning, identity lifecycle, conditional access policies, hybrid join)
- VMware vSphere scenarios (700+ VM management, PowerCLI automation, capacity planning, snapshot management)
- Active Directory & Group Policy scenarios (design, troubleshooting, migration, security hardening)
- Splunk/SolarWinds monitoring scenarios (dashboard creation, alert tuning, correlation searches)
- "Tell me about a time when..." behavioral questions mapped to actual Venable experience
- Systems architecture/design discussion prep (datacenter migration, hybrid cloud, disaster recovery)

Generate 12-15 likely_questions total with detailed suggested approaches.`

    case 'hiring_manager':
      return `Generate prep for a HIRING MANAGER interview stage.

Focus on:
- Leadership and culture-fit questions — how the candidate works with teams, handles conflict, mentors others
- Career narrative — how to tell the 20-year progression story compellingly for THIS specific role, emphasizing intentional growth
- Management style and team collaboration questions
- Salary negotiation prep and market positioning for the Indianapolis metro area
- "Why are you leaving?" and "What happened at your last role?" — prepared, confident, forward-looking answers
- Questions about team dynamics, direct reports, growth opportunities, and success metrics

Generate 8-10 likely_questions total with approaches.`

    case 'final_round':
      return `Generate prep for a FINAL ROUND interview stage.

Focus on:
- Synthesizing everything from prior rounds into a cohesive narrative
- Addressing any gaps or concerns raised in earlier interviews (use debrief data if available)
- Company values alignment with specific examples from the candidate's experience
- Closing strategy — how to express strong interest authentically without desperation
- Timeline and start date discussion preparation
- What to do if they make an offer on the spot
- Questions about onboarding, first 90 days, and success metrics

Generate 6-8 likely_questions total with approaches.`

    case 'offer':
      return `Generate prep for the OFFER stage.

Focus on:
- Salary negotiation strategy and counter-offer preparation based on market data for Indianapolis SysEng/DevOps roles
- Benefits evaluation questions (PTO, healthcare, 401k match, remote/hybrid flexibility, professional development budget)
- Start date and transition discussion
- Questions about onboarding process and first 90 days expectations
- How to handle competing offers or need for time to decide
- Relocation/remote work negotiation if applicable

Generate 5-6 likely_questions total with approaches.`

    default:
      return `Generate general interview prep for this stage: ${stage}.
Generate 8-10 likely_questions with suggested approaches.`
  }
}

// ── Context builder ─────────────────────────────────────────────────

function buildContextBlock(
  companyName: string,
  jobTitle: string,
  jobDescription: string | null,
  companyBriefData: Record<string, unknown> | null,
  priorDebriefs: Array<Record<string, unknown>> | null
): string {
  let context = `CANDIDATE PROFILE:
${RESUME_SUMMARY}

COMPANY: ${companyName}
ROLE: ${jobTitle}`

  if (jobDescription) {
    context += `\n\nJOB DESCRIPTION:\n${jobDescription}`
  }

  if (companyBriefData) {
    const brief = companyBriefData
    context += `\n\nCOMPANY INTELLIGENCE:`
    if (brief.overview) context += `\nOverview: ${brief.overview}`
    if (brief.culture) context += `\nCulture: ${brief.culture}`
    if (Array.isArray(brief.tech_stack) && brief.tech_stack.length > 0) {
      context += `\nTech Stack: ${brief.tech_stack.join(', ')}`
    }
    if (brief.recent_news && Array.isArray(brief.recent_news) && brief.recent_news.length > 0) {
      context += `\nRecent News: ${brief.recent_news.join('; ')}`
    }
    if (brief.why_good_fit) context += `\nFit Assessment: ${brief.why_good_fit}`
    if (brief.red_flags && brief.red_flags !== 'None identified') {
      context += `\nRed Flags: ${brief.red_flags}`
    }
  }

  if (priorDebriefs && priorDebriefs.length > 0) {
    context += `\n\nPRIOR INTERVIEW ROUNDS:`
    for (const debrief of priorDebriefs) {
      context += `\nStage: ${debrief.stage || 'unknown'}`
      if (debrief.went_well) context += `\n  What went well: ${debrief.went_well}`
      if (debrief.was_hard) context += `\n  What was hard: ${debrief.was_hard}`
      if (debrief.do_differently) context += `\n  Would do differently: ${debrief.do_differently}`
      if (Array.isArray(debrief.key_takeaways) && debrief.key_takeaways.length > 0) {
        context += `\n  Key takeaways: ${debrief.key_takeaways.join(', ')}`
      }
    }
    context += `\n\nADDRESS GAPS FROM PRIOR ROUNDS IN THIS PREP.`
  }

  return context
}

// ── Generator ───────────────────────────────────────────────────────

export async function generateInterviewPrep(
  companyName: string,
  jobTitle: string,
  jobDescription: string | null,
  stage: string,
  companyBriefData: Record<string, unknown> | null,
  priorDebriefs: Array<Record<string, unknown>> | null
): Promise<GenerationResult> {
  const config = getModelConfig('interview_prep')

  const contextBlock = buildContextBlock(
    companyName,
    jobTitle,
    jobDescription,
    companyBriefData,
    priorDebriefs
  )

  const stageInstructions = getStagePrompt(stage)

  const systemPrompt = `You are an expert interview coach preparing a senior systems engineer for a job interview.

${contextBlock}

${stageInstructions}

Return ONLY a valid JSON object (no markdown, no backticks, no commentary) with this exact structure:
{
  "likely_questions": [
    {
      "question": "The interview question",
      "category": "behavioral|technical|situational|culture_fit",
      "suggested_approach": "How to answer this question effectively, with specific examples from the candidate's experience"
    }
  ],
  "talking_points": [
    "Key point to hit during the interview"
  ],
  "gaps_to_address": [
    {
      "gap": "A potential concern the interviewer might have",
      "mitigation": "How to proactively address this gap"
    }
  ],
  "questions_to_ask": [
    {
      "question": "A thoughtful question for the interviewer",
      "why": "Why this question matters and what the answer reveals"
    }
  ],
  "career_narrative_angle": "A 2-3 sentence framing of the candidate's 20-year career progression that is compelling for THIS specific stage and role",
  "stage_specific_tips": [
    "Actionable tip specific to this interview stage"
  ]
}

IMPORTANT RULES:
- Every suggested_approach MUST reference specific experience, tools, or accomplishments from the candidate profile
- The career_narrative_angle must frame the long tenure positively as deliberate growth
- gaps_to_address should include realistic concerns (e.g., single-employer tenure, specific tech gaps) with genuine mitigations
- questions_to_ask should be insightful, not generic — they should demonstrate knowledge of the company/role
- Return ONLY the JSON object — no other text`

  const userMessage = `Generate interview prep for the ${stage.replace('_', ' ')} stage at ${companyName} for the "${jobTitle}" position.`

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
    }),
  })

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => 'Unknown error')
    throw new Error(
      `Anthropic API error (${resp.status}): ${errorBody.slice(0, 200)}`
    )
  }

  const data = await resp.json()

  // Extract text content from response
  const textContent = (data.content || [])
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { type: string; text: string }) => block.text)
    .join('')

  // Sanitize LLM artifacts (markdown fencing, preamble) then parse
  let prepData: InterviewPrepData
  try {
    prepData = JSON.parse(sanitizeJsonResponse(textContent))
  } catch {
    console.error('Failed to parse interview prep JSON. Raw:', textContent.slice(0, 500))
    throw new Error('Failed to parse interview prep JSON from AI response')
  }

  // Validate and fill defaults for any missing fields
  prepData = {
    likely_questions: Array.isArray(prepData.likely_questions)
      ? prepData.likely_questions.map((q) => ({
          question: q.question || 'No question provided',
          category: (['behavioral', 'technical', 'situational', 'culture_fit'] as const).includes(q.category)
            ? q.category
            : 'behavioral',
          suggested_approach: q.suggested_approach || 'No approach provided',
        }))
      : [],
    talking_points: Array.isArray(prepData.talking_points)
      ? prepData.talking_points
      : [],
    gaps_to_address: Array.isArray(prepData.gaps_to_address)
      ? prepData.gaps_to_address.map((g) => ({
          gap: g.gap || 'Unknown gap',
          mitigation: g.mitigation || 'No mitigation provided',
        }))
      : [],
    questions_to_ask: Array.isArray(prepData.questions_to_ask)
      ? prepData.questions_to_ask.map((q) => ({
          question: q.question || 'No question provided',
          why: q.why || 'No explanation provided',
        }))
      : [],
    career_narrative_angle:
      prepData.career_narrative_angle || 'No career narrative generated',
    stage_specific_tips: Array.isArray(prepData.stage_specific_tips)
      ? prepData.stage_specific_tips
      : [],
  }

  const costCents = estimateCostCents(
    data.usage?.input_tokens || 0,
    data.usage?.output_tokens || 0
  )

  return {
    prepData,
    modelUsed: config.model,
    costCents,
  }
}
