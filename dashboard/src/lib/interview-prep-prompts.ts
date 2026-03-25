import type { Debrief } from "@/types"

export const PREP_STAGES = ["phone_screen", "interview", "offer"] as const

export const RESUME_CONTEXT = `Joseph Fowler — 20+ years IT/systems engineering experience at Venable LLP:
- Windows Server administration (700+ VM environment across 3 datacenters)
- PowerShell automation framework (built org-wide scripting platform)
- VMware vSphere/vCenter management and optimization
- Splunk deployment (30+ custom dashboards, security monitoring)
- Azure hybrid cloud (AD Connect, Azure AD, conditional access)
- Active Directory (multi-domain forest, GPO management, 1000+ users)
- SolarWinds monitoring redesign (replaced legacy Nagios)
- Nimble SAN expansion and storage optimization
- Windows OS migration (coordinated 500+ endpoint upgrades)
- Backup/DR (Veeam, tested recovery procedures)`

interface AppContext {
  title: string
  company: string
  url: string | null
  salary_range: string | null
  notes: string
}

interface ConvoContext {
  notes?: string | null
}

function formatJobDetails(app: AppContext): string {
  const parts = [
    `Job Title: ${app.title}`,
    `Company: ${app.company}`,
  ]
  if (app.url) parts.push(`Job Posting URL: ${app.url}`)
  if (app.salary_range) parts.push(`Listed Salary Range: ${app.salary_range}`)
  if (app.notes) parts.push(`Candidate Notes: ${app.notes}`)
  return parts.join("\n")
}

function formatConversations(convos: ConvoContext[]): string {
  if (!convos.length) return ""
  const notes = convos
    .filter((c) => c.notes)
    .map((c, i) => `Conversation ${i + 1}: ${c.notes}`)
    .join("\n")
  return notes ? `\n\nPrior Conversation Notes:\n${notes}` : ""
}

function formatDebriefs(debriefs: Partial<Debrief>[]): string {
  if (!debriefs.length) return ""
  const entries = debriefs.map(
    (d) =>
      `Round ${d.round}: Rating ${d.rating}/5. Went well: ${d.went_well || "N/A"}. Challenging: ${d.challenging || "N/A"}. Takeaways: ${d.takeaways || "N/A"}.`
  )
  return `\n\nPrior Interview Debriefs:\n${entries.join("\n")}`
}

export function buildPhoneScreenPrompt(
  app: AppContext,
  conversations: ConvoContext[]
): string {
  return `You are preparing a candidate for a phone screen interview.

${formatJobDetails(app)}

Candidate Resume Summary:
${RESUME_CONTEXT}
${formatConversations(conversations)}

Use your web_search tool to:
1. Look up current information about ${app.company} (recent news, culture, tech stack)
2. Research current salary ranges for "${app.title}" roles${app.salary_range ? ` (listed range: ${app.salary_range})` : ""}
${app.url ? `3. Visit the job posting at ${app.url} to understand requirements` : ""}

Return ONLY a JSON object with these exact keys:
{
  "company_quick_hits": ["3-5 key facts about the company"],
  "elevator_pitch": "A 30-second pitch tailored to this role, referencing specific experience from the resume",
  "likely_questions": ["5-7 typical phone screen questions for this role"],
  "talking_points": ["Pre-written answers using the candidate's actual Venable LLP experience"],
  "questions_to_ask": ["3-5 smart questions to ask the interviewer"],
  "red_flags": ["Things to watch for during this phone screen"],
  "salary_prep": { "low": number, "mid": number, "high": number, "target": number, "source": "where you found this data" },
  "skills_to_study": ["Gaps between the JD requirements and the resume"]
}`
}

export function buildInterviewPrompt(
  app: AppContext,
  conversations: ConvoContext[],
  debriefs: Partial<Debrief>[]
): string {
  return `You are preparing a candidate for a technical interview.

${formatJobDetails(app)}

Candidate Resume Summary:
${RESUME_CONTEXT}
${formatConversations(conversations)}${formatDebriefs(debriefs)}

Use your web_search tool to research ${app.company}'s tech stack and interview style.
${app.url ? `Visit the job posting at ${app.url} to understand technical requirements.` : ""}

Map STAR stories from this real experience at Venable LLP:
- SolarWinds monitoring redesign (replaced Nagios, improved alert response time)
- PowerShell automation framework (org-wide scripting platform, saved 20+ hours/week)
- 700+ VM management (vSphere optimization, template standardization)
- Splunk dashboards (30+ custom dashboards for security and ops monitoring)
- Nimble SAN expansion (storage capacity planning and migration)
- Windows OS migration (coordinated 500+ endpoint upgrades with zero downtime)

Return ONLY a JSON object with these exact keys:
{
  "technical_deep_dive": ["Key technical topics from the JD to prepare for"],
  "scenario_questions": ["Walk me through... style questions based on the JD"],
  "star_stories": [{ "title": "story name", "situation": "...", "task": "...", "action": "...", "result": "..." }],
  "hands_on_prep": ["Scripting/hands-on scenarios if PowerShell, Azure, or similar is in the JD"],
  "architecture_questions": ["Infrastructure design questions appropriate for this level"],
  "knowledge_refresh": ["Study guide items for JD technologies the candidate is less familiar with"],
  "skills_to_study": ["Specific skills to brush up on before the interview"]
}`
}

export function buildOfferPrompt(
  app: AppContext,
  conversations: ConvoContext[],
  debriefs: Partial<Debrief>[]
): string {
  return `You are helping a candidate evaluate and negotiate a job offer.

${formatJobDetails(app)}

Candidate Resume Summary:
${RESUME_CONTEXT}
${formatConversations(conversations)}${formatDebriefs(debriefs)}

Use your web_search tool to:
1. Research current market salary data for "${app.title}" roles in the candidate's area
2. Look up ${app.company}'s Glassdoor reviews, benefits reputation, and compensation data

Return ONLY a JSON object with these exact keys:
{
  "salary_analysis": { "low": number, "mid": number, "high": number, "source": "where you found this data" },
  "negotiation_scripts": ["Word-for-word templates for salary negotiation conversations"],
  "benefits_checklist": ["Key benefits to evaluate: PTO, 401k match, remote policy, signing bonus, etc."],
  "counter_offer_framework": { "initial": "opening position", "walkaway": "minimum acceptable", "strategy": "negotiation approach" },
  "decision_matrix": { "factors": ["key decision factors"], "weights": { "factor_name": 1-10 } }
}`
}
