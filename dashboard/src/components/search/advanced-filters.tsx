"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { X } from "lucide-react"
import {
  type AdvancedFilters,
  DEFAULT_ADVANCED_FILTERS,
  hasActiveAdvancedFilters,
  countActiveAdvancedFilters,
} from "@/lib/search-filter-utils"
import type { Job } from "@/types"

interface AdvancedFiltersProps {
  filters: AdvancedFilters
  onFiltersChange: (filters: AdvancedFilters) => void
  /** All current results (pre-advanced-filter) for company autocomplete */
  jobs: Job[]
}

const DATE_OPTIONS = [
  { label: "Any time", value: "any" as const },
  { label: "Today", value: "today" as const },
  { label: "Last 3 days", value: "3days" as const },
  { label: "Last 7 days", value: "7days" as const },
  { label: "Last 14 days", value: "14days" as const },
  { label: "Last 30 days", value: "30days" as const },
]

export function AdvancedFiltersPanel({
  filters,
  onFiltersChange,
  jobs,
}: AdvancedFiltersProps) {
  const [expanded, setExpanded] = useState(false)
  const active = hasActiveAdvancedFilters(filters)
  const activeCount = countActiveAdvancedFilters(filters)

  // Include/exclude keyword inputs (raw text before splitting)
  const [includeText, setIncludeText] = useState("")
  const [excludeText, setExcludeText] = useState("")

  // Salary inputs
  const [salaryMinText, setSalaryMinText] = useState("")
  const [salaryMaxText, setSalaryMaxText] = useState("")

  // Company autocomplete
  const [companyQuery, setCompanyQuery] = useState("")
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false)
  const companyInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Click outside to close dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        companyInputRef.current &&
        !companyInputRef.current.contains(e.target as Node)
      ) {
        setCompanyDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Unique companies from current results with counts
  const companyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const job of jobs) {
      const name = job.company.trim()
      if (name) counts.set(name, (counts.get(name) || 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [jobs])

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.toLowerCase()
    const selected = new Set(filters.companies.map((c) => c.toLowerCase()))
    return companyCounts
      .filter((c) => !selected.has(c.name.toLowerCase()))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 10)
  }, [companyCounts, companyQuery, filters.companies])

  function update(patch: Partial<AdvancedFilters>) {
    onFiltersChange({ ...filters, ...patch })
  }

  function commitIncludeKeywords(text: string) {
    const keywords = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    update({ includeKeywords: keywords })
  }

  function commitExcludeKeywords(text: string) {
    const keywords = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    update({ excludeKeywords: keywords })
  }

  function commitSalaryMin(text: string) {
    const num = text ? parseInt(text.replace(/[^0-9]/g, "")) : NaN
    update({ salaryMin: isNaN(num) ? null : num })
  }

  function commitSalaryMax(text: string) {
    const num = text ? parseInt(text.replace(/[^0-9]/g, "")) : NaN
    update({ salaryMax: isNaN(num) ? null : num })
  }

  function addCompany(name: string) {
    if (!filters.companies.includes(name)) {
      update({ companies: [...filters.companies, name] })
    }
    setCompanyQuery("")
    setCompanyDropdownOpen(false)
  }

  function removeCompany(name: string) {
    update({ companies: filters.companies.filter((c) => c !== name) })
  }

  function clearAll() {
    onFiltersChange(DEFAULT_ADVANCED_FILTERS)
    setIncludeText("")
    setExcludeText("")
    setSalaryMinText("")
    setSalaryMaxText("")
    setCompanyQuery("")
  }

  return (
    <div>
      {/* Toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors py-1"
      >
        <span className="text-[10px]">{expanded ? "\u25BE" : "\u25B8"}</span>
        <span>
          Advanced Filters
          {active && !expanded && (
            <span className="ml-1 text-amber-600 dark:text-amber-400 font-semibold">
              ({activeCount} active)
            </span>
          )}
        </span>
      </button>

      {/* Panel */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: expanded ? "600px" : "0px", opacity: expanded ? 1 : 0 }}
      >
        <div className="mt-2 p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 space-y-4">
          {/* a) Keyword Include / Exclude */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
              Keywords
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 block">
                  Must contain (any)
                </label>
                <input
                  type="text"
                  value={includeText}
                  onChange={(e) => {
                    setIncludeText(e.target.value)
                    commitIncludeKeywords(e.target.value)
                  }}
                  placeholder="e.g., PowerShell, Azure, automation"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 block">
                  Exclude (any)
                </label>
                <input
                  type="text"
                  value={excludeText}
                  onChange={(e) => {
                    setExcludeText(e.target.value)
                    commitExcludeKeywords(e.target.value)
                  }}
                  placeholder="e.g., senior director, VP, manager"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
                />
              </div>
            </div>
          </div>

          {/* b) Salary Range */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
              Salary Range
            </span>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <input
                type="text"
                value={salaryMinText}
                onChange={(e) => {
                  setSalaryMinText(e.target.value)
                  commitSalaryMin(e.target.value)
                }}
                placeholder="$0"
                className="w-28 px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
              />
              <span className="text-xs text-zinc-400">to</span>
              <input
                type="text"
                value={salaryMaxText}
                onChange={(e) => {
                  setSalaryMaxText(e.target.value)
                  commitSalaryMax(e.target.value)
                }}
                placeholder="No max"
                className="w-28 px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
              />
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hideMissingSalary}
                  onChange={(e) => update({ hideMissingSalary: e.target.checked })}
                  className="rounded border-zinc-300 dark:border-zinc-600 text-amber-500 focus:ring-amber-300 h-3.5 w-3.5"
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Hide jobs without salary
                </span>
              </label>
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Parses ranges like &quot;$90K-$120K&quot; and hourly rates like &quot;$45/hr&quot; (&times;2080)
            </p>
          </div>

          {/* c) Company Filter */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
              Company
            </span>
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => update({ companyMode: "include" })}
                className={`px-2.5 py-1 rounded-md text-xs transition-all ${
                  filters.companyMode === "include"
                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-semibold border border-amber-300 dark:border-amber-700"
                    : "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                }`}
              >
                Show only
              </button>
              <button
                type="button"
                onClick={() => update({ companyMode: "exclude" })}
                className={`px-2.5 py-1 rounded-md text-xs transition-all ${
                  filters.companyMode === "exclude"
                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold border border-red-300 dark:border-red-700"
                    : "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                }`}
              >
                Exclude
              </button>
            </div>
            <div className="relative">
              <input
                ref={companyInputRef}
                type="text"
                value={companyQuery}
                onChange={(e) => {
                  setCompanyQuery(e.target.value)
                  setCompanyDropdownOpen(true)
                }}
                onFocus={() => setCompanyDropdownOpen(true)}
                placeholder="Type to search companies..."
                className="w-full sm:w-72 px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
              />
              {companyDropdownOpen && filteredCompanies.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute z-20 top-full mt-1 w-full sm:w-72 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-y-auto"
                >
                  {filteredCompanies.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => addCompany(c.name)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center justify-between"
                    >
                      <span className="text-zinc-800 dark:text-zinc-200 truncate">{c.name}</span>
                      <span className="text-zinc-400 dark:text-zinc-500 shrink-0 ml-2">({c.count})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Selected company chips */}
            {filters.companies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {filters.companies.map((name) => (
                  <span
                    key={name}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border ${
                      filters.companyMode === "include"
                        ? "bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                        : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700"
                    }`}
                  >
                    {name}
                    <button
                      type="button"
                      title={`Remove ${name}`}
                      onClick={() => removeCompany(name)}
                      className="hover:opacity-70"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* d) Date Posted */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
              Date Posted
            </span>
            <div className="flex flex-wrap gap-1.5">
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ datePosted: opt.value })}
                  className={`px-3 py-1.5 rounded-lg text-xs border cursor-pointer transition-all ${
                    filters.datePosted === opt.value
                      ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold"
                      : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-amber-300 dark:hover:border-amber-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* e) Clear All */}
          {active && (
            <div className="flex justify-end pt-1 border-t border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Clear Advanced Filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
