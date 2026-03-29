import type { Job } from "@/types"
import { parseSalary, parsePostedDate } from "@/lib/search-filter-utils"

export interface ParsedQuery {
  titleTerms: string[]
  companyTerms: string[]
  locationTerms: string[]
  salaryMin: number | null
  salaryMax: number | null
  source: string | null
  jobType: string | null
  postedWithinDays: number | null
  easyApply: boolean | null
  excludeTerms: string[]
  includeTerms: string[]
}

function emptyQuery(): ParsedQuery {
  return {
    titleTerms: [],
    companyTerms: [],
    locationTerms: [],
    salaryMin: null,
    salaryMax: null,
    source: null,
    jobType: null,
    postedWithinDays: null,
    easyApply: null,
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
    // If it was a quoted group, keep the quotes so the caller can detect them
    tokens.push(match[0])
  }
  return tokens
}

/** Strip surrounding quotes from a value */
function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1)
  }
  return s
}

/** Parse a salary query value like "90k", "120000" into annual dollars */
function parseSalaryQueryValue(val: string): number | null {
  const s = val.toLowerCase().replace(/[$,]/g, "")
  const kMatch = s.match(/^(\d+(?:\.\d+)?)k$/)
  if (kMatch) return parseFloat(kMatch[1]) * 1000
  const num = parseFloat(s)
  return isNaN(num) ? null : num
}

const TYPE_MAP: Record<string, string> = {
  fulltime: "full",
  "full-time": "full",
  ft: "full",
  contract: "contract",
  c2c: "contract",
  parttime: "part",
  "part-time": "part",
  pt: "part",
}

const KNOWN_FIELDS = new Set([
  "title", "company", "location", "salary", "source", "type", "posted", "easyapply",
])

export function parseQuery(queryString: string): ParsedQuery {
  const q = emptyQuery()
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
        // Unknown field — treat entire token as include term
        q.includeTerms.push(unquote(token))
        continue
      }

      switch (field) {
        case "title":
          if (value) q.titleTerms.push(value)
          break
        case "company":
          if (value) q.companyTerms.push(value)
          break
        case "location":
          if (value) q.locationTerms.push(value)
          break
        case "salary": {
          // salary:>90k  salary:<120k  salary:90k-120k
          if (value.startsWith(">")) {
            const num = parseSalaryQueryValue(value.slice(1))
            if (num !== null) q.salaryMin = num
          } else if (value.startsWith("<")) {
            const num = parseSalaryQueryValue(value.slice(1))
            if (num !== null) q.salaryMax = num
          } else if (value.includes("-")) {
            const parts = value.split("-")
            if (parts.length === 2) {
              const lo = parseSalaryQueryValue(parts[0])
              const hi = parseSalaryQueryValue(parts[1])
              if (lo !== null) q.salaryMin = lo
              if (hi !== null) q.salaryMax = hi
            }
          } else {
            // Exact: treat as minimum
            const num = parseSalaryQueryValue(value)
            if (num !== null) q.salaryMin = num
          }
          break
        }
        case "source":
          if (value) q.source = value.toLowerCase()
          break
        case "type":
          if (value) q.jobType = TYPE_MAP[value.toLowerCase()] || value.toLowerCase()
          break
        case "posted": {
          // posted:<3d  posted:<7d etc.
          const dayMatch = value.match(/^<?(\d+)d$/i)
          if (dayMatch) q.postedWithinDays = parseInt(dayMatch[1])
          break
        }
        case "easyapply":
          q.easyApply = value.toLowerCase() === "yes" || value === "true" || value === "1"
          break
      }
      continue
    }

    // Bare word or quoted phrase — include term
    q.includeTerms.push(unquote(token))
  }

  return q
}

export function applyQueryFilter(jobs: Job[], query: ParsedQuery): Job[] {
  // If query is completely empty, return all
  const isEmpty =
    query.titleTerms.length === 0 &&
    query.companyTerms.length === 0 &&
    query.locationTerms.length === 0 &&
    query.salaryMin === null &&
    query.salaryMax === null &&
    query.source === null &&
    query.jobType === null &&
    query.postedWithinDays === null &&
    query.easyApply === null &&
    query.excludeTerms.length === 0 &&
    query.includeTerms.length === 0
  if (isEmpty) return jobs

  return jobs.filter((job) => {
    const titleLower = job.title.toLowerCase()
    const companyLower = job.company.toLowerCase()
    const locationLower = (job.location || "").toLowerCase()
    const titleCompany = `${titleLower} ${companyLower}`

    // Include terms: all must match in title or company
    for (const term of query.includeTerms) {
      if (!titleCompany.includes(term.toLowerCase())) return false
    }

    // Exclude terms: any match excludes
    for (const term of query.excludeTerms) {
      if (titleCompany.includes(term.toLowerCase())) return false
    }

    // Title terms
    for (const term of query.titleTerms) {
      if (!titleLower.includes(term.toLowerCase())) return false
    }

    // Company terms
    for (const term of query.companyTerms) {
      if (!companyLower.includes(term.toLowerCase())) return false
    }

    // Location terms
    for (const term of query.locationTerms) {
      if (!locationLower.includes(term.toLowerCase())) return false
    }

    // Source
    if (query.source) {
      if (!job.source.toLowerCase().includes(query.source)) return false
    }

    // Job type
    if (query.jobType) {
      const typeLower = (job.type || "").toLowerCase()
      if (!typeLower.includes(query.jobType)) return false
    }

    // Salary
    if (query.salaryMin !== null || query.salaryMax !== null) {
      const parsed = parseSalary(job.salary)
      if (parsed) {
        if (query.salaryMin !== null && parsed.max < query.salaryMin) return false
        if (query.salaryMax !== null && parsed.min > query.salaryMax) return false
      }
      // If salary not parseable, include (don't hide unknowns)
    }

    // Posted date
    if (query.postedWithinDays !== null) {
      const posted = parsePostedDate(job.posted)
      if (posted) {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - query.postedWithinDays)
        cutoff.setHours(0, 0, 0, 0)
        if (posted < cutoff) return false
      }
      // If can't parse, include
    }

    // Easy Apply
    if (query.easyApply !== null) {
      if (query.easyApply && !job.easyApply) return false
    }

    return true
  })
}

export function serializeQuery(query: ParsedQuery): string {
  const parts: string[] = []
  for (const t of query.includeTerms) {
    parts.push(t.includes(" ") ? `"${t}"` : t)
  }
  for (const t of query.excludeTerms) {
    parts.push(t.includes(" ") ? `-"${t}"` : `-${t}`)
  }
  for (const t of query.titleTerms) parts.push(`title:${t.includes(" ") ? `"${t}"` : t}`)
  for (const t of query.companyTerms) parts.push(`company:${t.includes(" ") ? `"${t}"` : t}`)
  for (const t of query.locationTerms) parts.push(`location:${t.includes(" ") ? `"${t}"` : t}`)
  if (query.salaryMin !== null && query.salaryMax !== null) {
    parts.push(`salary:${query.salaryMin >= 1000 ? `${query.salaryMin / 1000}k` : query.salaryMin}-${query.salaryMax >= 1000 ? `${query.salaryMax / 1000}k` : query.salaryMax}`)
  } else if (query.salaryMin !== null) {
    parts.push(`salary:>${query.salaryMin >= 1000 ? `${query.salaryMin / 1000}k` : query.salaryMin}`)
  } else if (query.salaryMax !== null) {
    parts.push(`salary:<${query.salaryMax >= 1000 ? `${query.salaryMax / 1000}k` : query.salaryMax}`)
  }
  if (query.source) parts.push(`source:${query.source}`)
  if (query.jobType) parts.push(`type:${query.jobType}`)
  if (query.postedWithinDays !== null) parts.push(`posted:<${query.postedWithinDays}d`)
  if (query.easyApply) parts.push(`easyapply:yes`)
  return parts.join(" ")
}
