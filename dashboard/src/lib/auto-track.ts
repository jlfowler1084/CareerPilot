/**
 * Auto-track: detect job application confirmation emails and extract details.
 * Pure TypeScript — no React dependencies.
 */

export interface DetectionResult {
  isConfirmation: boolean
  confidence: number
  source: "LinkedIn" | "Indeed" | "Dice" | "Glassdoor" | "Workday" | "Greenhouse" | "Lever" | "iCIMS" | "Direct" | "Unknown"
  hints: {
    company?: string
    title?: string
    url?: string
    location?: string
  }
  statusUpdate?: "rejected" | null
}

export interface ExtractionResult {
  company: string
  title: string
  location: string | null
  source: string
  job_url: string | null
  applied_date: string
}

interface EmailInput {
  from_email: string
  from_domain: string | null
  subject: string | null
  body_preview: string | null
  category: string
  received_at: string
}

// ── Domain blocklist (NOT job applications) ──────────

const DOMAIN_BLOCKLIST = new Set([
  "schwab.com", "fidelity.com", "vanguard.com", "chase.com", "wellsfargo.com",
  "bankofamerica.com", "capitalone.com", "apple.com", "google.com",
  "microsoft.com", "github.com", "supabase.com", "vercel.com", "netlify.com", "stripe.com",
])

// ── Rejection patterns ───────────────────────────────

const REJECTION_PATTERNS = [
  "decided to pursue other candidate",
  "unfortunately",
  "not moving forward",
  "position has been filled",
  "regret to inform",
  "will not be moving forward",
  "selected another candidate",
  "not been selected",
  "we have decided",
]

function isRejectionEmail(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase()
  return REJECTION_PATTERNS.some((p) => text.includes(p))
}

// ── Detection rules ──────────────────────────────────

export function detectApplicationConfirmation(email: EmailInput): DetectionResult {
  const domain = (email.from_domain || "").toLowerCase()
  const fromEmail = (email.from_email || "").toLowerCase()
  const subject = (email.subject || "").toLowerCase()
  const body = (email.body_preview || "").toLowerCase()

  const result: DetectionResult = {
    isConfirmation: false,
    confidence: 0,
    source: "Unknown",
    hints: {},
    statusUpdate: null,
  }

  // Blocklist check
  if (DOMAIN_BLOCKLIST.has(domain)) return result

  // Rejection check (should not create new app, but may update existing)
  if (isRejectionEmail(subject, body)) {
    result.statusUpdate = "rejected"
    return result
  }

  // ── HIGH confidence (0.9+) ──────────────────────────

  // LinkedIn confirmation
  if (fromEmail === "jobs-noreply@linkedin.com" && (subject.includes("application was sent") || subject.includes("you applied for"))) {
    result.isConfirmation = true
    result.confidence = 0.95
    result.source = "LinkedIn"
    // Parse structured LinkedIn body
    const companyMatch = (email.subject || "").match(/(?:application was sent to|you applied for .+ at)\s+(.+)$/i)
    if (companyMatch) result.hints.company = companyMatch[1].trim()
    // Parse title + location from body
    const bodyLines = (email.body_preview || "").split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
    if (bodyLines.length >= 3 && result.hints.company) {
      // Pattern: "Your application was sent to X\n\nTitle\nCompany\nLocation"
      const companyIdx = bodyLines.findIndex((l) => l === result.hints.company)
      if (companyIdx > 0) {
        result.hints.title = bodyLines[companyIdx - 1]
        if (bodyLines[companyIdx + 1] && !bodyLines[companyIdx + 1].startsWith("View")) {
          result.hints.location = bodyLines[companyIdx + 1]
        }
      }
    }
    // URL from body
    const urlMatch = (email.body_preview || "").match(/(https:\/\/www\.linkedin\.com\/comm\/jobs\/view\/\d+)/)
    if (urlMatch) result.hints.url = urlMatch[1]
    return result
  }

  // Workday confirmation
  if (domain === "myworkday.com" && (subject.includes("thank you for applying") || body.includes("you have officially applied"))) {
    result.isConfirmation = true
    result.confidence = 0.92
    result.source = "Workday"
    // Try to extract from subject: "Thank you for applying to the X Team!"
    const teamMatch = (email.subject || "").match(/applying to (?:the )?(.+?)(?:\s+team)?!/i)
    if (teamMatch) result.hints.company = teamMatch[1].trim()
    // Try to extract title from body
    const titleMatch = (email.body_preview || "").match(/applied to (?:the )?(.+?)(?:\.\.\.|\.|\n)/i)
    if (titleMatch) result.hints.title = titleMatch[1].trim()
    return result
  }

  // Greenhouse confirmation
  if (domain === "greenhouse.io" && subject.includes("application") && (subject.includes("received") || subject.includes("submitted") || subject.includes("thank you"))) {
    result.isConfirmation = true
    result.confidence = 0.90
    result.source = "Greenhouse"
    return result
  }

  // Lever confirmation
  if (domain === "lever.co" && subject.includes("application") && (subject.includes("received") || subject.includes("submitted"))) {
    result.isConfirmation = true
    result.confidence = 0.90
    result.source = "Lever"
    return result
  }

  // ── MEDIUM confidence (0.7-0.85) ────────────────────

  // Glassdoor post-application
  if (domain === "glassdoor.com" && subject.includes("your application at")) {
    result.isConfirmation = true
    result.confidence = 0.75
    result.source = "Glassdoor"
    const glMatch = (email.subject || "").match(/application at\s+(.+)/i)
    if (glMatch) result.hints.company = glMatch[1].replace(/[?.!]$/, "").trim()
    const titleMatch = (email.body_preview || "").match(/applied for\s+(.+?)\s+at\s/i)
    if (titleMatch) result.hints.title = titleMatch[1].trim()
    return result
  }

  // Indeed confirmation
  if ((domain === "indeed.com" || domain === "indeedmail.com") && (subject.includes("application submitted") || subject.includes("you applied"))) {
    result.isConfirmation = true
    result.confidence = 0.80
    result.source = "Indeed"
    return result
  }

  // Dice confirmation
  if (domain === "dice.com" && subject.includes("application") && (subject.includes("confirmation") || subject.includes("applied"))) {
    result.isConfirmation = true
    result.confidence = 0.80
    result.source = "Dice"
    return result
  }

  // iCIMS confirmation
  if (domain === "icims.com" && subject.includes("application") && (subject.includes("received") || subject.includes("submitted") || subject.includes("thank you"))) {
    result.isConfirmation = true
    result.confidence = 0.85
    result.source = "iCIMS"
    return result
  }

  // Generic ATS patterns
  const genericPatterns = [
    "thank you for applying",
    "application received",
    "we received your application",
    "application submitted",
    "your application has been submitted",
  ]
  if (genericPatterns.some((p) => subject.includes(p) || body.includes(p))) {
    result.isConfirmation = true
    result.confidence = 0.70
    result.source = "Direct"
    return result
  }

  // ── LOW confidence (0.5-0.7) ────────────────────────
  if (subject.includes("application") && (subject.includes("confirm") || subject.includes("received") || subject.includes("submitted"))) {
    result.isConfirmation = true
    result.confidence = 0.55
    result.source = "Unknown"
    return result
  }

  return result
}

// ── Extraction ───────────────────────────────────────

/**
 * Extract application details from a confirmation email.
 * Uses rules-based hints first; falls back to AI only when hints are insufficient.
 */
export function extractFromHints(
  email: EmailInput,
  hints: DetectionResult["hints"],
  source: DetectionResult["source"]
): ExtractionResult | null {
  const company = hints.company || email.from_domain?.replace(/^(mail|hr|recruiting|careers)\./i, "").replace(/\.com$/, "") || null
  const title = hints.title || null

  if (!company || !title) return null

  return {
    company,
    title,
    location: hints.location || null,
    source: source === "Unknown" ? "Direct" : source,
    job_url: hints.url || null,
    applied_date: email.received_at,
  }
}

/**
 * Build the AI extraction prompt for when rules-based extraction fails.
 */
export function buildExtractionPrompt(email: EmailInput): string {
  return `Extract job application details from this confirmation email. Return JSON only: { "company": "...", "title": "...", "location": "..." or null, "source": "..." or null, "job_url": "..." or null }

From: ${email.from_email}
Subject: ${email.subject || ""}
Body: ${(email.body_preview || "").slice(0, 1500)}`
}
