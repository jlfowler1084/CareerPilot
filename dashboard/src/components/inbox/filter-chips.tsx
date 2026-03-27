"use client"

import type { Email, EmailApplicationLink, EmailCategory } from "@/types"

interface FilterChipsProps {
  emails: Email[]
  links: EmailApplicationLink[]
  excludedFilters: Set<string>
  showUnlinkedOnly: boolean
  onToggleFilter: (filterId: string) => void
  onShowAll: () => void
  onConversations: () => void
  onToggleUnlinked: () => void
  showDismissed: boolean
}

const CATEGORY_FILTERS: { id: string; label: string; categories: EmailCategory[] }[] = [
  { id: "recruiter", label: "Recruiter", categories: ["recruiter_outreach"] },
  { id: "interview", label: "Interview", categories: ["interview_request"] },
  { id: "follow_up", label: "Follow-up", categories: ["follow_up"] },
  { id: "offers", label: "Offers", categories: ["offer"] },
  { id: "alerts", label: "Alerts", categories: ["job_alert"] },
  { id: "rejected", label: "Rejected", categories: ["rejection"] },
  { id: "irrelevant", label: "Irrelevant", categories: ["irrelevant"] },
]

export const ALL_FILTER_IDS = CATEGORY_FILTERS.map((f) => f.id)

const CONVERSATIONS_EXCLUDED = new Set(["alerts", "irrelevant"])

export function FilterChips({
  emails, links, excludedFilters, showUnlinkedOnly,
  onToggleFilter, onShowAll, onConversations, onToggleUnlinked, showDismissed,
}: FilterChipsProps) {
  const visible = showDismissed ? emails : emails.filter((e) => !e.dismissed)
  const linkedEmailIds = new Set(links.map((l) => l.email_id))

  const allActive = excludedFilters.size === 0
  const isConversationsPreset =
    excludedFilters.size === CONVERSATIONS_EXCLUDED.size &&
    [...CONVERSATIONS_EXCLUDED].every((id) => excludedFilters.has(id))

  // Build excluded categories from excluded filter IDs
  const excludedCategories = new Set<string>()
  excludedFilters.forEach((filterId) => {
    const filter = CATEGORY_FILTERS.find((f) => f.id === filterId)
    if (filter) filter.categories.forEach((c) => excludedCategories.add(c))
  })

  function getCategoryCount(filter: (typeof CATEGORY_FILTERS)[number]): number {
    return visible.filter((e) => filter.categories.includes(e.category)).length
  }

  // "All" count reflects what's actually visible (respects excluded filters)
  const effectiveVisible = excludedCategories.size > 0
    ? visible.filter((e) => !excludedCategories.has(e.category))
    : visible
  const allCount = effectiveVisible.length
  const unlinkedCount = visible.filter((e) => !linkedEmailIds.has(e.id)).length

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* All chip */}
      <button
        onClick={onShowAll}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          allActive && !showUnlinkedOnly
            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
        }`}
      >
        {allActive ? "All" : `All (-${excludedFilters.size})`}
        <span className="ml-1">{allCount}</span>
      </button>

      {/* Category chips */}
      {CATEGORY_FILTERS.map((filter) => {
        const count = getCategoryCount(filter)
        const active = !excludedFilters.has(filter.id)
        return (
          <button
            key={filter.id}
            onClick={() => onToggleFilter(filter.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              active
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                : count === 0
                ? "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-600 border border-transparent line-through"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
            }`}
          >
            {filter.label}
            <span className={`ml-1 ${!active && count === 0 ? "opacity-50" : ""}`}>
              {count}
            </span>
          </button>
        )
      })}

      {/* Separator */}
      <div className="w-px bg-zinc-200 dark:bg-zinc-700 mx-0.5 self-stretch" />

      {/* Conversations preset */}
      <button
        onClick={onConversations}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          isConversationsPreset && !showUnlinkedOnly
            ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
        }`}
      >
        Conversations
      </button>

      {/* Unlinked chip */}
      <button
        onClick={onToggleUnlinked}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          showUnlinkedOnly
            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
            : unlinkedCount === 0
            ? "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-600 border border-transparent"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
        }`}
      >
        Unlinked
        <span className={`ml-1 ${unlinkedCount === 0 && !showUnlinkedOnly ? "opacity-50" : ""}`}>
          {unlinkedCount}
        </span>
      </button>
    </div>
  )
}
