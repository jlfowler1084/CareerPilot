"use client"

import type { Email, EmailApplicationLink, EmailCategory } from "@/types"

interface FilterChipsProps {
  emails: Email[]
  links: EmailApplicationLink[]
  activeFilter: string
  onFilter: (filter: string) => void
  showDismissed: boolean
}

const FILTERS: { id: string; label: string; categories?: EmailCategory[] }[] = [
  { id: "all", label: "All" },
  { id: "recruiter", label: "Recruiter", categories: ["recruiter_outreach"] },
  { id: "interview", label: "Interview", categories: ["interview_request"] },
  { id: "follow_up", label: "Follow-up", categories: ["follow_up"] },
  { id: "offers", label: "Offers", categories: ["offer"] },
  { id: "alerts", label: "Alerts", categories: ["job_alert"] },
  { id: "rejected", label: "Rejected", categories: ["rejection"] },
  { id: "unlinked", label: "Unlinked" },
]

export function FilterChips({ emails, links, activeFilter, onFilter, showDismissed }: FilterChipsProps) {
  const visible = showDismissed ? emails : emails.filter((e) => !e.dismissed)
  const linkedEmailIds = new Set(links.map((l) => l.email_id))

  function getCount(filter: (typeof FILTERS)[number]): number {
    if (filter.id === "all") return visible.length
    if (filter.id === "unlinked") return visible.filter((e) => !linkedEmailIds.has(e.id)).length
    if (filter.categories) return visible.filter((e) => filter.categories!.includes(e.category)).length
    return 0
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map((filter) => {
        const count = getCount(filter)
        const active = activeFilter === filter.id
        return (
          <button
            key={filter.id}
            onClick={() => onFilter(filter.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              active
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                : count === 0
                ? "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-600 border border-transparent"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
            }`}
          >
            {filter.label}
            <span className={`ml-1 ${count === 0 && !active ? "opacity-50" : ""}`}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
