/**
 * CAR-78: Extract job suggestions from alert emails (Indeed, LinkedIn, Glassdoor, Dice)
 * Rules-based subject parsing + optional AI extraction for Indeed body text.
 */

export interface ExtractedSuggestion {
  title: string
  company: string
  location?: string
  salary?: string
  source: string // 'LinkedIn', 'Indeed', 'Glassdoor', 'Dice'
  job_url?: string
  description?: string
}

// ─── Source detection ─────────────────────────────────

const DOMAIN_TO_SOURCE: Record<string, string> = {
  "match.indeed.com": "Indeed",
  "indeed.com": "Indeed",
  "linkedin.com": "LinkedIn",
  "glassdoor.com": "Glassdoor",
  "dice.com": "Dice",
}

export function detectSource(fromDomain: string, fromEmail: string): string | null {
  const domain = fromDomain.toLowerCase()
  for (const [pattern, source] of Object.entries(DOMAIN_TO_SOURCE)) {
    if (domain === pattern || domain.endsWith(`.${pattern}`)) return source
  }
  // Check email address for secondary patterns
  const email = fromEmail.toLowerCase()
  if (email.includes("indeed")) return "Indeed"
  if (email.includes("linkedin")) return "LinkedIn"
  if (email.includes("glassdoor")) return "Glassdoor"
  if (email.includes("dice")) return "Dice"
  return null
}

// ─── Subject line parsers ────────────────────────────

function parseIndeedSubject(subject: string): ExtractedSuggestion[] {
  // "Powershell Scripter at Compucom Staffing in North Carolina and 12 more new jobs"
  const fullMatch = subject.match(/^(.+?)\s+at\s+(.+?)\s+in\s+(.+?)\s+and\s+\d+\s+more/i)
  if (fullMatch) {
    return [{ title: fullMatch[1].trim(), company: fullMatch[2].trim(), location: fullMatch[3].trim(), source: "Indeed" }]
  }

  // "Title at Company in Location"
  const atInMatch = subject.match(/^(.+?)\s+at\s+(.+?)\s+in\s+(.+?)$/i)
  if (atInMatch) {
    return [{ title: atInMatch[1].trim(), company: atInMatch[2].trim(), location: atInMatch[3].trim(), source: "Indeed" }]
  }

  // "Title at Company"
  const atMatch = subject.match(/^(.+?)\s+at\s+(.+?)(?:\s+and\s+\d+\s+more)?$/i)
  if (atMatch) {
    return [{ title: atMatch[1].trim(), company: atMatch[2].trim(), source: "Indeed" }]
  }

  // "Title @ Company"
  const atSymbolMatch = subject.match(/^(.+?)\s*@\s*(.+?)$/i)
  if (atSymbolMatch) {
    return [{ title: atSymbolMatch[1].trim(), company: atSymbolMatch[2].trim(), source: "Indeed" }]
  }

  return []
}

function parseGlassdoorSubject(subject: string): ExtractedSuggestion[] {
  // "IT Technical Support at Linkstar Solution Corporation and 2 more jobs in Indianapolis, IN for you. Apply Now."
  const fullMatch = subject.match(/^(.+?)\s+at\s+(.+?)\s+and\s+\d+\s+more\s+jobs?\s+in\s+(.+?)\s+for\s+you/i)
  if (fullMatch) {
    return [{ title: fullMatch[1].trim(), company: fullMatch[2].trim(), location: fullMatch[3].trim(), source: "Glassdoor" }]
  }

  // "Title at Company and X more jobs"
  const atMoreMatch = subject.match(/^(.+?)\s+at\s+(.+?)\s+and\s+\d+\s+more/i)
  if (atMoreMatch) {
    return [{ title: atMoreMatch[1].trim(), company: atMoreMatch[2].trim(), source: "Glassdoor" }]
  }

  // "Company is hiring for Title. Apply Now."
  const hiringMatch = subject.match(/^(.+?)\s+is\s+hiring\s+for\s+(.+?)\.?\s*(?:Apply\s+Now)?\.?$/i)
  if (hiringMatch) {
    return [{ title: hiringMatch[2].trim(), company: hiringMatch[1].trim(), source: "Glassdoor" }]
  }

  // "Title role at Company: you would be a great fit"
  const fitMatch = subject.match(/^(.+?)\s+role\s+at\s+(.+?):\s*you\s+would/i)
  if (fitMatch) {
    return [{ title: fitMatch[1].trim(), company: fitMatch[2].trim(), source: "Glassdoor" }]
  }

  // "Title at Company"
  const atMatch = subject.match(/^(.+?)\s+at\s+(.+?)(?:\.\s*Apply\s+Now)?\.?$/i)
  if (atMatch) {
    return [{ title: atMatch[1].trim(), company: atMatch[2].trim(), source: "Glassdoor" }]
  }

  return []
}

function parseLinkedInSubject(subject: string): ExtractedSuggestion[] {
  // "Jobs via Dice is hiring for VMWare Admin"
  const viaMatch = subject.match(/^Jobs?\s+via\s+(.+?)\s+is\s+hiring\s+for\s+(.+?)$/i)
  if (viaMatch) {
    return [{ title: viaMatch[2].trim(), company: viaMatch[1].trim(), source: "LinkedIn" }]
  }

  // "Company is hiring a Title"
  const hiringAMatch = subject.match(/^(.+?)\s+is\s+hiring\s+(?:a|an)\s+(.+?)$/i)
  if (hiringAMatch) {
    return [{ title: hiringAMatch[2].trim(), company: hiringAMatch[1].trim(), source: "LinkedIn" }]
  }

  // "Company is hiring for Title"
  const hiringForMatch = subject.match(/^(.+?)\s+is\s+hiring\s+for\s+(.+?)$/i)
  if (hiringForMatch) {
    return [{ title: hiringForMatch[2].trim(), company: hiringForMatch[1].trim(), source: "LinkedIn" }]
  }

  return []
}

export function parseSubjectForJobs(subject: string, fromDomain: string): ExtractedSuggestion[] {
  if (!subject) return []

  const source = detectSource(fromDomain, "")
  switch (source) {
    case "Indeed":
      return parseIndeedSubject(subject)
    case "Glassdoor":
      return parseGlassdoorSubject(subject)
    case "LinkedIn":
      return parseLinkedInSubject(subject)
    case "Dice":
      // Dice alerts often come through LinkedIn; try LinkedIn patterns
      return parseLinkedInSubject(subject)
    default:
      return []
  }
}

// ─── AI extraction for Indeed ────────────────────────

export async function extractJobsWithAI(
  bodyPreview: string,
  subject: string,
  source: string,
): Promise<ExtractedSuggestion[]> {
  try {
    const resp = await fetch("/api/suggestions/ai-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: bodyPreview, subject, source }),
    })
    if (!resp.ok) return []
    const { jobs } = await resp.json()
    return (jobs || []).map((j: Partial<ExtractedSuggestion>) => ({
      title: j.title || "",
      company: j.company || "",
      location: j.location,
      salary: j.salary,
      description: j.description,
      source,
    })).filter((j: ExtractedSuggestion) => j.title && j.company)
  } catch {
    return []
  }
}

// ─── Body content check ─────────────────────────────

function hasReadableBody(bodyPreview: string | null): boolean {
  if (!bodyPreview) return false
  // Strip whitespace/zero-width chars and check remaining length
  const cleaned = bodyPreview.replace(/[\s\u200B-\u200F\u00AD\u200E\u200F]+/g, "")
  return cleaned.length > 50
}

// ─── Main extraction function ────────────────────────

export async function extractSuggestionsFromEmail(email: {
  id: string
  subject: string | null
  body_preview: string | null
  from_domain: string | null
  from_email: string
  received_at: string
}): Promise<ExtractedSuggestion[]> {
  const source = detectSource(email.from_domain || "", email.from_email)
  if (!source) return []

  // 1. Parse subject line
  const subjectResults = parseSubjectForJobs(email.subject || "", email.from_domain || "")

  // 2. AI extraction for Indeed only (body has readable content)
  let aiResults: ExtractedSuggestion[] = []
  if (source === "Indeed" && hasReadableBody(email.body_preview)) {
    aiResults = await extractJobsWithAI(email.body_preview || "", email.subject || "", source)
  }
  // Glassdoor: body is garbled, skip AI
  // LinkedIn: body is mostly URLs, skip AI

  // 3. Merge and deduplicate
  const all = [...subjectResults, ...aiResults]
  const seen = new Set<string>()
  const deduped: ExtractedSuggestion[] = []
  for (const s of all) {
    const key = `${s.title.toLowerCase()}|||${s.company.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(s)
    }
  }

  return deduped
}
