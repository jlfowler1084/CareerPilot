"use client"

import type { EmailCategory } from "@/types/email"

const CATEGORY_STYLES: Record<EmailCategory, { bg: string; text: string; label: string }> = {
  recruiter_outreach: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", label: "Recruiter" },
  interview_request: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", label: "Interview" },
  follow_up: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", label: "Follow-up" },
  offer: { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", label: "Offer" },
  job_alert: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400", label: "Alert" },
  rejection: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-600 dark:text-red-400", label: "Rejected" },
  irrelevant: { bg: "bg-zinc-50 dark:bg-zinc-800/50", text: "text-zinc-400 dark:text-zinc-500", label: "Irrelevant" },
  unclassified: { bg: "bg-zinc-100 dark:bg-zinc-800 animate-pulse", text: "text-zinc-400", label: "..." },
}

export function CategoryBadge({ category }: { category: EmailCategory }) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.irrelevant
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}
