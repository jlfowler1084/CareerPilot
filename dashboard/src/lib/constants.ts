import type { ApplicationStatus } from "@/types"

export const STATUSES = [
  { id: "found" as const, label: "Found", color: "#6b7280" },
  { id: "interested" as const, label: "Interested", color: "#06b6d4" },
  { id: "applied" as const, label: "Applied", color: "#3b82f6" },
  { id: "phone_screen" as const, label: "Phone Screen", color: "#8b5cf6" },
  { id: "interview" as const, label: "Interview", color: "#f59e0b" },
  { id: "offer" as const, label: "Offer", color: "#10b981" },
  { id: "rejected" as const, label: "Rejected", color: "#ef4444" },
  { id: "withdrawn" as const, label: "Withdrawn", color: "#9ca3af" },
  { id: "ghosted" as const, label: "Ghosted", color: "#d1d5db" },
] as const

export const RESPONSE_STATUSES: ApplicationStatus[] = [
  "phone_screen",
  "interview",
  "offer",
  "rejected",
]

export const SEARCH_PROFILES = [
  { id: "sysadmin_local", label: "Sys Admin — Indy", keyword: "systems administrator", location: "Indianapolis, IN", source: "both" as const },
  { id: "syseng_local", label: "Systems Engineer — Indy", keyword: "systems engineer Windows", location: "Indianapolis, IN", source: "both" as const },
  { id: "devops_local", label: "DevOps / Cloud — Indy", keyword: "DevOps cloud engineer Azure", location: "Indianapolis, IN", source: "both" as const },
  { id: "powershell_remote", label: "PowerShell / Automation — Remote", keyword: "PowerShell automation engineer", location: "remote", source: "both" as const },
  { id: "infra_remote", label: "Infrastructure — Remote", keyword: "Windows server VMware infrastructure", location: "remote", source: "dice" as const },
  { id: "msp_local", label: "MSP / IT Services — Indy", keyword: "managed services IT engineer", location: "Indianapolis, IN", source: "indeed" as const },
  { id: "contract_infra", label: "Contract — Infrastructure", keyword: "Windows server VMware infrastructure", location: "Indianapolis, IN", source: "dice_contract" as const },
  { id: "ad_identity", label: "AD / Identity — Remote", keyword: "Active Directory engineer identity", location: "remote", source: "dice" as const },
] as const

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
