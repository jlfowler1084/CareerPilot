import type { Email } from "@/types"
import { parseEmailDate } from "@/lib/inbox-filter-utils"

export interface ParsedInboxQuery {
  subjectTerms: string[]
  fromTerms: string[]
  domainTerms: string[]
  bodyTerms: string[]
  categoryTerms: string[]
  linkedFilter: boolean | null
  dateWithinDays: number | null
  autoTrackFilter: string | null
  excludeTerms: string[]
  includeTerms: string[]
}

function emptyInboxQuery(): ParsedInboxQuery {
  return {
    subjectTerms: [],
    fromTerms: [],
    domainTerms: [],
    bodyTerms: [],
    categoryTerms: [],
    linkedFilter: null,
    dateWithinDays: null,
    autoTrackFilter: null,
    excludeTerms: [],
    includeTerms: [],
  }
}

/** Tokenize query string, respecting quoted strings */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  const regex = /"([^"]*)"|\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[0])
  }
  return tokens
}

/** Strip surrounding quotes */
function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1)
  }
  return s
}

/** Normalize category shorthand to full category name */
const CATEGORY_MAP: Record<string, string> = {
  recruiter: "recruiter_outreach",
  outreach: "recruiter_outreach",
  recruiter_outreach: "recruiter_outreach",
  interview: "interview_request",
  interview_request: "interview_request",
  follow_up: "follow_up",
  followup: "follow_up",
  offer: "offer",
  alert: "job_alert",
  job_alert: "job_alert",
  rejection: "rejection",
  rejected: "rejection",
  irrelevant: "irrelevant",
  unclassified: "unclassified",
}

const KNOWN_FIELDS = new Set([
  "subject", "from", "sender", "domain", "body", "category",
  "linked", "date", "autotrack",
])

export function parseInboxQuery(queryString: string): ParsedInboxQuery {
  const q = emptyInboxQuery()
  if (!queryString.trim()) return q

  const tokens = tokenize(queryString)

  for (const token of tokens) {
    // Exclude term: -keyword or -"phrase"
    if (token.startsWith("-") && token.length > 1) {
      const inner = token.slice(1)
      q.excludeTerms.push(unquote(inner))
      continue
    }

    // Field filter: field:value or field:"value"
    const colonIdx = token.indexOf(":")
    if (colonIdx > 0) {
      const field = token.slice(0, colonIdx).toLowerCase()
      const rawValue = token.slice(colonIdx + 1)
      const value = unquote(rawValue)

      if (!KNOWN_FIELDS.has(field)) {
        q.includeTerms.push(unquote(token))
        continue
      }

      switch (field) {
        case "subject":
          if (value) q.subjectTerms.push(value)
          break
        case "from":
        case "sender":
          if (value) q.fromTerms.push(value)
          break
        case "domain":
          if (value) q.domainTerms.push(value)
          break
        case "body":
          if (value) q.bodyTerms.push(value)
          break
        case "category": {
          if (value) {
            const normalized = CATEGORY_MAP[value.toLowerCase()] || value.toLowerCase()
            q.categoryTerms.push(normalized)
          }
          break
        }
        case "linked":
          q.linkedFilter = value.toLowerCase() === "yes" || value === "true" || value === "1"
          break
        case "date": {
          // date:<7d  date:<30d
          const dayMatch = value.match(/^<?(\d+)d$/i)
          if (dayMatch) q.dateWithinDays = parseInt(dayMatch[1])
          break
        }
        case "autotrack":
          if (value) q.autoTrackFilter = value.toLowerCase()
          break
      }
      continue
    }

    // Bare word or quoted phrase — include term
    q.includeTerms.push(unquote(token))
  }

  return q
}

export function applyInboxQueryFilter(
  emails: Email[],
  query: ParsedInboxQuery,
  linkedEmailIds: Set<string>,
): Email[] {
  const isEmpty =
    query.subjectTerms.length === 0 &&
    query.fromTerms.length === 0 &&
    query.domainTerms.length === 0 &&
    query.bodyTerms.length === 0 &&
    query.categoryTerms.length === 0 &&
    query.linkedFilter === null &&
    query.dateWithinDays === null &&
    query.autoTrackFilter === null &&
    query.excludeTerms.length === 0 &&
    query.includeTerms.length === 0
  if (isEmpty) return emails

  return emails.filter((email) => {
    const subjectLower = (email.subject || "").toLowerCase()
    const fromNameLower = (email.from_name || "").toLowerCase()
    const fromEmailLower = (email.from_email || "").toLowerCase()
    const domainLower = (email.from_domain || "").toLowerCase()
    const bodyLower = (email.body_preview || "").toLowerCase()
    const searchable = `${subjectLower} ${fromNameLower} ${fromEmailLower} ${bodyLower}`

    // Include terms: all must match in searchable text
    for (const term of query.includeTerms) {
      if (!searchable.includes(term.toLowerCase())) return false
    }

    // Exclude terms: any match excludes
    for (const term of query.excludeTerms) {
      if (searchable.includes(term.toLowerCase())) return false
    }

    // Subject terms
    for (const term of query.subjectTerms) {
      if (!subjectLower.includes(term.toLowerCase())) return false
    }

    // From terms (match from_name or from_email)
    for (const term of query.fromTerms) {
      const tl = term.toLowerCase()
      if (!fromNameLower.includes(tl) && !fromEmailLower.includes(tl)) return false
    }

    // Domain terms
    for (const term of query.domainTerms) {
      if (!domainLower.includes(term.toLowerCase())) return false
    }

    // Body terms
    for (const term of query.bodyTerms) {
      if (!bodyLower.includes(term.toLowerCase())) return false
    }

    // Category terms (OR — any category match keeps)
    if (query.categoryTerms.length > 0) {
      if (!query.categoryTerms.includes(email.category)) return false
    }

    // Linked filter
    if (query.linkedFilter !== null) {
      const isLinked = linkedEmailIds.has(email.id)
      if (query.linkedFilter && !isLinked) return false
      if (!query.linkedFilter && isLinked) return false
    }

    // Date range
    if (query.dateWithinDays !== null) {
      const received = parseEmailDate(email.received_at)
      if (received) {
        const daysAgo = (Date.now() - received.getTime()) / (1000 * 60 * 60 * 24)
        if (daysAgo > query.dateWithinDays) return false
      }
    }

    // Auto-track filter
    if (query.autoTrackFilter !== null) {
      if (email.auto_track_status !== query.autoTrackFilter) return false
    }

    return true
  })
}
