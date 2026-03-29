import type { Job } from "@/types"

export interface SearchFilters {
  source: "all" | "Dice" | "Indeed"
  jobType: "all" | "Full-time" | "Contract" | "Part-time"
  location: "all" | "remote" | "onsite"
  hasSalary: boolean
  easyApplyOnly: boolean
  keyword: string
}

export const DEFAULT_FILTERS: SearchFilters = {
  source: "all",
  jobType: "all",
  location: "all",
  hasSalary: false,
  easyApplyOnly: false,
  keyword: "",
}

export function applyFilters(jobs: Job[], filters: SearchFilters): Job[] {
  return jobs.filter((job) => {
    if (filters.source !== "all" && job.source !== filters.source) return false

    if (filters.jobType !== "all") {
      const normalizedType = (job.type || "").toLowerCase()
      if (!normalizedType.includes(filters.jobType.toLowerCase())) return false
    }

    if (filters.location !== "all") {
      const loc = (job.location || "").toLowerCase()
      if (filters.location === "remote") {
        if (!loc.includes("remote")) return false
      } else if (filters.location === "onsite") {
        if (loc.includes("remote") || loc === "") return false
      }
    }

    if (filters.hasSalary) {
      if (!job.salary || job.salary === "Not listed" || job.salary.trim() === "") return false
    }

    if (filters.easyApplyOnly) {
      if (!job.easyApply) return false
    }

    if (filters.keyword.trim()) {
      const kw = filters.keyword.toLowerCase()
      const searchable = `${job.title} ${job.company} ${job.location}`.toLowerCase()
      if (!searchable.includes(kw)) return false
    }

    return true
  })
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.source !== "all" ||
    filters.jobType !== "all" ||
    filters.location !== "all" ||
    filters.hasSalary ||
    filters.easyApplyOnly ||
    filters.keyword.trim() !== ""
  )
}

export function countActiveFilters(filters: SearchFilters): number {
  let count = 0
  if (filters.source !== "all") count++
  if (filters.jobType !== "all") count++
  if (filters.location !== "all") count++
  if (filters.hasSalary) count++
  if (filters.easyApplyOnly) count++
  if (filters.keyword.trim()) count++
  return count
}

// ─── Advanced Filters ────────────────────────────────

export interface AdvancedFilters {
  includeKeywords: string[]
  excludeKeywords: string[]
  salaryMin: number | null
  salaryMax: number | null
  hideMissingSalary: boolean
  companies: string[]
  companyMode: "include" | "exclude"
  datePosted: "any" | "today" | "3days" | "7days" | "14days" | "30days"
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  includeKeywords: [],
  excludeKeywords: [],
  salaryMin: null,
  salaryMax: null,
  hideMissingSalary: false,
  companies: [],
  companyMode: "include",
  datePosted: "any",
}

export interface ParsedSalary {
  min: number
  max: number
  annual: number
}

/**
 * Parse messy salary strings into annual dollar amounts.
 * Handles: "$90,000", "$90K", "$45/hr", "$90,000 - $120,000", "Up to $110,000"
 */
export function parseSalary(salaryStr: string): ParsedSalary | null {
  if (!salaryStr || salaryStr === "Not listed" || salaryStr.trim() === "") return null

  const s = salaryStr.replace(/,/g, "").toLowerCase()

  // Check if hourly
  const isHourly = /\/\s*(hr|hour|h)\b/.test(s)

  // Extract all numbers (with optional K suffix)
  const numMatches = [...s.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*k?/gi)]
  if (numMatches.length === 0) return null

  const nums = numMatches.map((m) => {
    let val = parseFloat(m[1])
    // Check if followed by 'k'
    const fullMatch = m[0].toLowerCase()
    if (fullMatch.includes("k")) val *= 1000
    if (isHourly) val *= 2080
    return val
  })

  // Filter out nonsense (numbers < 10 that aren't hourly — probably not salary)
  const salaryNums = nums.filter((n) => n >= 1000 || isHourly)
  if (salaryNums.length === 0) return null

  const min = Math.min(...salaryNums)
  const max = Math.max(...salaryNums)
  const annual = salaryNums.length >= 2 ? Math.round((min + max) / 2) : min

  return { min, max, annual }
}

const DATE_RANGE_DAYS: Record<AdvancedFilters["datePosted"], number> = {
  any: Infinity,
  today: 0,
  "3days": 3,
  "7days": 7,
  "14days": 14,
  "30days": 30,
}

/**
 * Parse posted date strings: "3/28/2026", "2 days ago", "Just posted", "Today", "Yesterday"
 */
export function parsePostedDate(postedStr: string): Date | null {
  if (!postedStr) return null
  const s = postedStr.trim().toLowerCase()

  // "just posted" / "today"
  if (s === "just posted" || s === "today") return new Date()

  // "yesterday" / "1 day ago"
  if (s === "yesterday" || s === "1 day ago") {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d
  }

  // "X days ago" / "X day ago"
  const daysAgoMatch = s.match(/(\d+)\s*days?\s*ago/)
  if (daysAgoMatch) {
    const d = new Date()
    d.setDate(d.getDate() - parseInt(daysAgoMatch[1]))
    return d
  }

  // "X hours ago"
  const hoursAgoMatch = s.match(/(\d+)\s*hours?\s*ago/)
  if (hoursAgoMatch) return new Date()

  // Date format: M/D/YYYY or MM/DD/YYYY
  const dateMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dateMatch) {
    const d = new Date(parseInt(dateMatch[3]), parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]))
    if (!isNaN(d.getTime())) return d
  }

  // ISO-ish formats
  const parsed = new Date(postedStr)
  if (!isNaN(parsed.getTime())) return parsed

  return null
}

export function applyAdvancedFilters(jobs: Job[], filters: AdvancedFilters): Job[] {
  return jobs.filter((job) => {
    // Include keywords (OR logic)
    if (filters.includeKeywords.length > 0) {
      const searchable = `${job.title} ${job.company}`.toLowerCase()
      const matches = filters.includeKeywords.some((kw) => searchable.includes(kw.toLowerCase()))
      if (!matches) return false
    }

    // Exclude keywords (OR logic)
    if (filters.excludeKeywords.length > 0) {
      const searchable = `${job.title} ${job.company}`.toLowerCase()
      const excluded = filters.excludeKeywords.some((kw) => searchable.includes(kw.toLowerCase()))
      if (excluded) return false
    }

    // Salary range
    if (filters.salaryMin !== null || filters.salaryMax !== null || filters.hideMissingSalary) {
      const parsed = parseSalary(job.salary)
      if (!parsed) {
        if (filters.hideMissingSalary) return false
        // If salary not parseable and user set a range, include unknown jobs (don't hide)
      } else {
        if (filters.salaryMin !== null && parsed.max < filters.salaryMin) return false
        if (filters.salaryMax !== null && parsed.min > filters.salaryMax) return false
      }
    }

    // Company filter
    if (filters.companies.length > 0) {
      const companyLower = job.company.toLowerCase()
      const inList = filters.companies.some((c) => c.toLowerCase() === companyLower)
      if (filters.companyMode === "include" && !inList) return false
      if (filters.companyMode === "exclude" && inList) return false
    }

    // Date posted
    if (filters.datePosted !== "any") {
      const posted = parsePostedDate(job.posted)
      if (posted) {
        const now = new Date()
        const rangeDays = DATE_RANGE_DAYS[filters.datePosted]
        const cutoff = new Date(now)
        cutoff.setDate(cutoff.getDate() - rangeDays)
        cutoff.setHours(0, 0, 0, 0)
        if (posted < cutoff) return false
      }
      // If can't parse, include the job (don't hide unknowns)
    }

    return true
  })
}

export function hasActiveAdvancedFilters(filters: AdvancedFilters): boolean {
  return (
    filters.includeKeywords.length > 0 ||
    filters.excludeKeywords.length > 0 ||
    filters.salaryMin !== null ||
    filters.salaryMax !== null ||
    filters.hideMissingSalary ||
    filters.companies.length > 0 ||
    filters.datePosted !== "any"
  )
}

export function countActiveAdvancedFilters(filters: AdvancedFilters): number {
  let count = 0
  if (filters.includeKeywords.length > 0) count++
  if (filters.excludeKeywords.length > 0) count++
  if (filters.salaryMin !== null || filters.salaryMax !== null || filters.hideMissingSalary) count++
  if (filters.companies.length > 0) count++
  if (filters.datePosted !== "any") count++
  return count
}
