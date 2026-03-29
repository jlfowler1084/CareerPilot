"use client"

import { useState, useEffect, useRef } from "react"
import { Search } from "lucide-react"
import {
  type InboxQuickFilters,
  DEFAULT_INBOX_QUICK_FILTERS,
  hasActiveInboxQuickFilters,
} from "@/lib/inbox-filter-utils"

interface InboxQuickFiltersBarProps {
  filters: InboxQuickFilters
  onFiltersChange: (filters: InboxQuickFilters) => void
  totalCount: number
  filteredCount: number
}

const DATE_OPTIONS: { label: string; value: InboxQuickFilters["dateRange"] }[] = [
  { label: "All", value: "any" },
  { label: "Today", value: "today" },
  { label: "3 Days", value: "3days" },
  { label: "7 Days", value: "7days" },
  { label: "14 Days", value: "14days" },
  { label: "30 Days", value: "30days" },
]

const LINKED_OPTIONS: { label: string; value: InboxQuickFilters["linkedStatus"] }[] = [
  { label: "All", value: "all" },
  { label: "Linked", value: "linked" },
  { label: "Unlinked", value: "unlinked" },
]

const AUTOTRACK_OPTIONS: { label: string; value: InboxQuickFilters["hasAutoTrack"] }[] = [
  { label: "All", value: "all" },
  { label: "Auto-tracked", value: "tracked" },
  { label: "Needs Review", value: "prompted" },
]

export function InboxQuickFiltersBar({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
}: InboxQuickFiltersBarProps) {
  const [keywordInput, setKeywordInput] = useState(filters.keyword)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external keyword changes
  useEffect(() => {
    setKeywordInput(filters.keyword)
  }, [filters.keyword])

  function update(patch: Partial<InboxQuickFilters>) {
    onFiltersChange({ ...filters, ...patch })
  }

  function handleKeywordChange(value: string) {
    setKeywordInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      update({ keyword: value })
    }, 300)
  }

  const active = hasActiveInboxQuickFilters(filters)

  return (
    <div className="space-y-2">
      {/* Keyword search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => handleKeywordChange(e.target.value)}
            placeholder="Search emails..."
            className="w-full text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300 dark:focus:ring-amber-500/40 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          />
        </div>
        {active && (
          <button
            type="button"
            onClick={() => {
              onFiltersChange(DEFAULT_INBOX_QUICK_FILTERS)
              setKeywordInput("")
            }}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors whitespace-nowrap"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Chip rows */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {/* Date range */}
        <ChipGroup label="Date">
          {DATE_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              active={filters.dateRange === opt.value}
              onClick={() => update({ dateRange: opt.value })}
            />
          ))}
        </ChipGroup>

        {/* Linked status */}
        <ChipGroup label="Linked">
          {LINKED_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              active={filters.linkedStatus === opt.value}
              onClick={() => update({ linkedStatus: opt.value })}
            />
          ))}
        </ChipGroup>

        {/* Auto-track */}
        <ChipGroup label="Track">
          {AUTOTRACK_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              active={filters.hasAutoTrack === opt.value}
              onClick={() => update({ hasAutoTrack: opt.value })}
            />
          ))}
        </ChipGroup>
      </div>

      {/* Result count */}
      {active && totalCount > 0 && (
        <div className="flex justify-end">
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
            Showing {filteredCount} of {totalCount} emails
          </span>
        </div>
      )}
    </div>
  )
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider w-10 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {children}
      </div>
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11px] border cursor-pointer transition-all ${
        active
          ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold"
          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-amber-300 dark:hover:border-amber-600"
      }`}
    >
      {label}
    </button>
  )
}
