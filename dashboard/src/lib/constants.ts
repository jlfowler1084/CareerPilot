import type { ApplicationStatus } from "@/types"

export const STATUSES = [
  { id: "found" as const, label: "Found", color: "#6b7280", bg: "#f3f4f6" },
  { id: "interested" as const, label: "Interested", color: "#3b82f6", bg: "#eff6ff" },
  { id: "applied" as const, label: "Applied", color: "#6366f1", bg: "#eef2ff" },
  { id: "phone_screen" as const, label: "Phone Screen", color: "#a855f7", bg: "#faf5ff" },
  { id: "interview" as const, label: "Interview", color: "#8b5cf6", bg: "#f5f3ff" },
  { id: "offer" as const, label: "Offer", color: "#22c55e", bg: "#f0fdf4" },
  { id: "rejected" as const, label: "Rejected", color: "#ef4444", bg: "#fef2f2" },
  { id: "withdrawn" as const, label: "Withdrawn", color: "#f97316", bg: "#fff7ed" },
  { id: "ghosted" as const, label: "Ghosted", color: "#64748b", bg: "#f8fafc" },
] as const

/** Lookup helper — STATUS_CONFIG["applied"].color etc. */
export const STATUS_CONFIG = Object.fromEntries(
  STATUSES.map((s) => [s.id, s])
) as Record<(typeof STATUSES)[number]["id"], (typeof STATUSES)[number]>

export const RESPONSE_STATUSES: ApplicationStatus[] = [
  "phone_screen",
  "interview",
  "offer",
  "rejected",
]

/** Fallback profiles used when Supabase is unavailable */
export const DEFAULT_SEARCH_PROFILES = [
  { id: "sysadmin_local", label: "Sys Admin — Indy", icon: "\uD83D\uDDA5\uFE0F", keyword: "systems administrator", location: "Indianapolis, IN", source: "both" as const },
  { id: "syseng_local", label: "Systems Engineer — Indy", icon: "\u2699\uFE0F", keyword: "systems engineer Windows", location: "Indianapolis, IN", source: "both" as const },
  { id: "devops_local", label: "DevOps / Cloud — Indy", icon: "\u2601\uFE0F", keyword: "DevOps cloud engineer Azure", location: "Indianapolis, IN", source: "both" as const },
  { id: "powershell_remote", label: "PowerShell / Automation — Remote", icon: "\uD83D\uDCDC", keyword: "PowerShell automation engineer", location: "remote", source: "both" as const },
  { id: "infra_remote", label: "Infrastructure — Remote", icon: "\uD83C\uDFD7\uFE0F", keyword: "Windows server VMware infrastructure", location: "remote", source: "dice" as const },
  { id: "msp_local", label: "MSP / IT Services — Indy", icon: "\uD83D\uDD27", keyword: "managed services IT engineer", location: "Indianapolis, IN", source: "indeed" as const },
  { id: "contract_infra", label: "Contract — Infrastructure", icon: "\uD83D\uDCCB", keyword: "Windows server VMware infrastructure", location: "Indianapolis, IN", source: "dice_contract" as const },
  { id: "ad_identity", label: "AD / Identity — Remote", icon: "\uD83D\uDD10", keyword: "Active Directory engineer identity", location: "remote", source: "dice" as const },
] as const

/** @deprecated Use DEFAULT_SEARCH_PROFILES — kept for backward compatibility */
export const SEARCH_PROFILES = DEFAULT_SEARCH_PROFILES

export const CONVERSATION_TYPES = [
  { id: "phone" as const, label: "Phone Call", icon: "\u{1F4DE}" },
  { id: "video" as const, label: "Video Call", icon: "\u{1F4F9}" },
  { id: "email" as const, label: "Email", icon: "\u{1F4E7}" },
  { id: "in_person" as const, label: "In Person", icon: "\u{1F3E2}" },
  { id: "chat" as const, label: "Chat", icon: "\u{1F4AC}" },
  { id: "note" as const, label: "Note", icon: "\u{1F4DD}" },
] as const

export const IRRELEVANT_KEYWORDS = [
  "pest control",
  "hvac",
  "construction",
  "mechanical engineer",
  "civil engineer",
  "plumber",
  "electrician",
  "roofing",
  "landscaping",
  "janitorial",
  "custodian",
] as const
