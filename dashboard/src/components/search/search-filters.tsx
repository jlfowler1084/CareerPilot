"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Search } from "lucide-react"
import {
  type SearchFilters,
  DEFAULT_FILTERS,
  hasActiveFilters,
  countActiveFilters,
} from "@/lib/search-filter-utils"

export { DEFAULT_FILTERS }
export type { SearchFilters }

interface SearchFiltersProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  totalCount: number
  filteredCount: number
}

type ChipOption<T extends string> = { label: string; value: T }

function FilterChip<T extends string>({
  option,
  active,
  onClick,
}: {
  option: ChipOption<T>
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs border cursor-pointer transition-all ${
        active
          ? "border-amber-400 bg-amber-50 text-amber-800 font-bold"
          : "border-zinc-200 bg-white text-zinc-500 hover:border-amber-300"
      }`}
    >
      {option.label}
    </button>
  )
}

const SOURCE_OPTIONS: ChipOption<SearchFilters["source"]>[] = [
  { label: "All", value: "all" },
  { label: "Dice", value: "Dice" },
  { label: "Indeed", value: "Indeed" },
]

const JOB_TYPE_OPTIONS: ChipOption<SearchFilters["jobType"]>[] = [
  { label: "All", value: "all" },
  { label: "Full-time", value: "Full-time" },
  { label: "Contract", value: "Contract" },
  { label: "Part-time", value: "Part-time" },
]

const LOCATION_OPTIONS: ChipOption<SearchFilters["location"]>[] = [
  { label: "All", value: "all" },
  { label: "Remote", value: "remote" },
  { label: "On-site", value: "onsite" },
]

export function SearchFiltersBar({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
}: SearchFiltersProps) {
  const [expanded, setExpanded] = useState(true)
  const active = hasActiveFilters(filters)
  const activeCount = countActiveFilters(filters)

  function update(patch: Partial<SearchFilters>) {
    onFiltersChange({ ...filters, ...patch })
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-between bg-white rounded-xl border border-zinc-200 px-4 py-2.5 text-xs text-zinc-500 hover:border-zinc-300 transition-colors"
      >
        <span>
          {active ? (
            <>
              <span className="font-semibold text-amber-700">{activeCount} filter{activeCount !== 1 ? "s" : ""} active</span>
              <span className="text-zinc-400"> · {filteredCount} of {totalCount} results</span>
            </>
          ) : (
            "Filters"
          )}
        </span>
        <ChevronDown size={14} className="text-zinc-400" />
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider hover:text-zinc-700 transition-colors"
        >
          Filters
          <ChevronUp size={12} />
        </button>
        {active && (
          <button
            type="button"
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Source */}
      <FilterRow label="Source">
        {SOURCE_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            option={opt}
            active={filters.source === opt.value}
            onClick={() => update({ source: opt.value })}
          />
        ))}
      </FilterRow>

      {/* Job Type */}
      <FilterRow label="Type">
        {JOB_TYPE_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            option={opt}
            active={filters.jobType === opt.value}
            onClick={() => update({ jobType: opt.value })}
          />
        ))}
      </FilterRow>

      {/* Location */}
      <FilterRow label="Location">
        {LOCATION_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            option={opt}
            active={filters.location === opt.value}
            onClick={() => update({ location: opt.value })}
          />
        ))}
      </FilterRow>

      {/* Salary + Easy Apply */}
      <FilterRow label="Options">
        <FilterChip
          option={{ label: "All", value: "all" }}
          active={!filters.hasSalary && !filters.easyApplyOnly}
          onClick={() => update({ hasSalary: false, easyApplyOnly: false })}
        />
        <FilterChip
          option={{ label: "Has Salary", value: "salary" }}
          active={filters.hasSalary}
          onClick={() => update({ hasSalary: !filters.hasSalary })}
        />
        <FilterChip
          option={{ label: "Easy Apply", value: "easy" }}
          active={filters.easyApplyOnly}
          onClick={() => update({ easyApplyOnly: !filters.easyApplyOnly })}
        />
      </FilterRow>

      {/* Keyword */}
      <FilterRow label="Keyword">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => update({ keyword: e.target.value })}
            placeholder="Filter by keyword..."
            className="text-xs border border-zinc-200 rounded-lg pl-7 pr-3 py-1.5 w-64 focus:outline-none focus:ring-1 focus:ring-amber-300 focus:border-amber-300 placeholder:text-zinc-400"
          />
        </div>
      </FilterRow>

      {/* Result count */}
      {totalCount > 0 && (
        <div className="flex justify-end pt-1">
          <span className="text-xs font-mono text-zinc-500">
            {active
              ? `Showing ${filteredCount} of ${totalCount} results`
              : `${totalCount} results`}
          </span>
        </div>
      )}
    </div>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider w-16 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {children}
      </div>
    </div>
  )
}
