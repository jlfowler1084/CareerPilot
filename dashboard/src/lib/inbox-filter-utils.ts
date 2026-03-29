import type { Email } from "@/types"

// ─── Quick Filters ───────────────────────────────────

export interface InboxQuickFilters {
  keyword: string
  dateRange: "any" | "today" | "3days" | "7days" | "14days" | "30days"
  linkedStatus: "all" | "linked" | "unlinked"
  hasAutoTrack: "all" | "tracked" | "prompted"
}

export const DEFAULT_INBOX_QUICK_FILTERS: InboxQuickFilters = {
  keyword: "",
  dateRange: "any",
  linkedStatus: "all",
  hasAutoTrack: "all",
}

// ─── Advanced Filters ────────────────────────────────

export interface InboxAdvancedFilters {
  senderInclude: string[]
  senderExclude: string[]
  domainInclude: string[]
  domainExclude: string[]
  subjectInclude: string[]
  subjectExclude: string[]
  bodyKeywords: string[]
}

export const DEFAULT_INBOX_ADVANCED_FILTERS: InboxAdvancedFilters = {
  senderInclude: [],
  senderExclude: [],
  domainInclude: [],
  domainExclude: [],
  subjectInclude: [],
  subjectExclude: [],
  bodyKeywords: [],
}

// ─── Date helpers ────────────────────────────────────

const DATE_RANGE_HOURS: Record<InboxQuickFilters["dateRange"], number> = {
  any: Infinity,
  today: 24,
  "3days": 72,
  "7days": 168,
  "14days": 336,
  "30days": 720,
}

export function parseEmailDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

// ─── Quick filter logic ──────────────────────────────

export function applyInboxQuickFilters(
  emails: Email[],
  filters: InboxQuickFilters,
  linkedEmailIds: Set<string>,
): Email[] {
  return emails.filter((email) => {
    // Keyword search: subject + from_name + from_email + body_preview
    if (filters.keyword.trim()) {
      const kw = filters.keyword.toLowerCase()
      const searchable = [
        email.subject || "",
        email.from_name || "",
        email.from_email || "",
        email.body_preview || "",
      ].join(" ").toLowerCase()
      if (!searchable.includes(kw)) return false
    }

    // Date range
    if (filters.dateRange !== "any") {
      const received = parseEmailDate(email.received_at)
      if (received) {
        const hoursAgo = (Date.now() - received.getTime()) / (1000 * 60 * 60)
        if (hoursAgo > DATE_RANGE_HOURS[filters.dateRange]) return false
      }
    }

    // Linked status
    if (filters.linkedStatus === "linked") {
      if (!linkedEmailIds.has(email.id)) return false
    } else if (filters.linkedStatus === "unlinked") {
      if (linkedEmailIds.has(email.id)) return false
    }

    // Auto-track status
    if (filters.hasAutoTrack === "tracked") {
      if (email.auto_track_status !== "tracked") return false
    } else if (filters.hasAutoTrack === "prompted") {
      if (email.auto_track_status !== "prompted") return false
    }

    return true
  })
}

// ─── Advanced filter logic ───────────────────────────

export function applyInboxAdvancedFilters(
  emails: Email[],
  filters: InboxAdvancedFilters,
): Email[] {
  return emails.filter((email) => {
    const senderText = `${email.from_name || ""} ${email.from_email || ""}`.toLowerCase()
    const domainText = (email.from_domain || "").toLowerCase()
    const subjectText = (email.subject || "").toLowerCase()
    const bodyText = (email.body_preview || "").toLowerCase()

    // Sender include (OR — any match keeps)
    if (filters.senderInclude.length > 0) {
      if (!filters.senderInclude.some((s) => senderText.includes(s.toLowerCase()))) return false
    }

    // Sender exclude (OR — any match removes)
    if (filters.senderExclude.length > 0) {
      if (filters.senderExclude.some((s) => senderText.includes(s.toLowerCase()))) return false
    }

    // Domain include
    if (filters.domainInclude.length > 0) {
      if (!filters.domainInclude.some((d) => domainText.includes(d.toLowerCase()))) return false
    }

    // Domain exclude
    if (filters.domainExclude.length > 0) {
      if (filters.domainExclude.some((d) => domainText.includes(d.toLowerCase()))) return false
    }

    // Subject include
    if (filters.subjectInclude.length > 0) {
      if (!filters.subjectInclude.some((s) => subjectText.includes(s.toLowerCase()))) return false
    }

    // Subject exclude
    if (filters.subjectExclude.length > 0) {
      if (filters.subjectExclude.some((s) => subjectText.includes(s.toLowerCase()))) return false
    }

    // Body keywords (OR — any match keeps)
    if (filters.bodyKeywords.length > 0) {
      if (!filters.bodyKeywords.some((kw) => bodyText.includes(kw.toLowerCase()))) return false
    }

    return true
  })
}

// ─── Active filter detection ─────────────────────────

export function hasActiveInboxQuickFilters(filters: InboxQuickFilters): boolean {
  return (
    filters.keyword.trim() !== "" ||
    filters.dateRange !== "any" ||
    filters.linkedStatus !== "all" ||
    filters.hasAutoTrack !== "all"
  )
}

export function hasActiveInboxAdvancedFilters(filters: InboxAdvancedFilters): boolean {
  return (
    filters.senderInclude.length > 0 ||
    filters.senderExclude.length > 0 ||
    filters.domainInclude.length > 0 ||
    filters.domainExclude.length > 0 ||
    filters.subjectInclude.length > 0 ||
    filters.subjectExclude.length > 0 ||
    filters.bodyKeywords.length > 0
  )
}

export function countActiveInboxQuickFilters(filters: InboxQuickFilters): number {
  let count = 0
  if (filters.keyword.trim()) count++
  if (filters.dateRange !== "any") count++
  if (filters.linkedStatus !== "all") count++
  if (filters.hasAutoTrack !== "all") count++
  return count
}

export function countActiveInboxAdvancedFilters(filters: InboxAdvancedFilters): number {
  let count = 0
  if (filters.senderInclude.length > 0) count++
  if (filters.senderExclude.length > 0) count++
  if (filters.domainInclude.length > 0) count++
  if (filters.domainExclude.length > 0) count++
  if (filters.subjectInclude.length > 0) count++
  if (filters.subjectExclude.length > 0) count++
  if (filters.bodyKeywords.length > 0) count++
  return count
}
