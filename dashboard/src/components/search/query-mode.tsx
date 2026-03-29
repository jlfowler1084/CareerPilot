"use client"

import { useState, useEffect, useRef } from "react"
import { HelpCircle, X, Keyboard, ArrowLeft } from "lucide-react"

const RECENT_QUERIES_KEY = "careerpilot_recent_queries"
const MAX_RECENT = 5

function loadRecentQueries(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_QUERIES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecentQueries(queries: string[]) {
  localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(queries.slice(0, MAX_RECENT)))
}

interface QueryModeProps {
  queryString: string
  onQueryChange: (query: string) => void
  onToggle: () => void
  totalCount: number
  filteredCount: number
}

const SYNTAX_HELP = `Filter Syntax:
  title:keyword       title contains "keyword"
  company:name        company contains "name"
  location:place      location contains "place"
  salary:>90k         salary above $90,000
  salary:<120k        salary below $120,000
  salary:90k-120k     salary in range
  source:dice         Dice results only
  source:indeed       Indeed results only
  type:fulltime       full-time only (also: contract, parttime)
  posted:<3d          posted within last 3 days (also: 7d, 14d, 30d)
  easyapply:yes       Easy Apply only
  -keyword            exclude jobs containing "keyword"
  "exact phrase"      match exact phrase in title or company
  keyword             bare word matches title or company

Examples:
  powershell location:remote salary:>100k
  title:engineer -"senior director" source:dice
  company:lilly type:fulltime posted:<7d`

export function QueryMode({
  queryString,
  onQueryChange,
  onToggle,
  totalCount,
  filteredCount,
}: QueryModeProps) {
  const [showHelp, setShowHelp] = useState(false)
  const [recentQueries, setRecentQueries] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setRecentQueries(loadRecentQueries())
  }, [])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleInputChange(value: string) {
    onQueryChange(value)

    // Debounce saving to recent queries (save when user pauses typing)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim()
      if (trimmed && trimmed.length >= 3) {
        setRecentQueries((prev) => {
          const filtered = prev.filter((q) => q !== trimmed)
          const updated = [trimmed, ...filtered].slice(0, MAX_RECENT)
          saveRecentQueries(updated)
          return updated
        })
      }
    }, 1500)
  }

  function handleSelectRecent(query: string) {
    onQueryChange(query)
    inputRef.current?.focus()
  }

  function handleClearRecent(query: string) {
    setRecentQueries((prev) => {
      const updated = prev.filter((q) => q !== query)
      saveRecentQueries(updated)
      return updated
    })
  }

  const hasQuery = queryString.trim().length > 0
  const isFiltered = hasQuery && filteredCount !== totalCount

  return (
    <div className="space-y-3">
      {/* Toggle back + help */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft size={12} />
          Back to Filters
        </button>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          title="Query syntax help"
          className={`p-1 rounded-full transition-colors ${
            showHelp
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
              : "text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400"
          }`}
        >
          <HelpCircle size={14} />
        </button>
      </div>

      {/* Query input */}
      <div className="p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 space-y-3">
        <div className="flex items-center gap-2">
          <Keyboard size={14} className="text-zinc-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Query Mode
          </span>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={queryString}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder='title:engineer location:remote salary:>90k -company:"Acme" posted:<7d'
          className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
        />

        {/* Result count */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
            {isFiltered
              ? `Showing ${filteredCount} of ${totalCount} results`
              : `${totalCount} results`}
          </span>
          {hasQuery && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Recent queries */}
        {recentQueries.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Recent
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recentQueries.map((q) => (
                <span
                  key={q}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[11px] font-mono text-zinc-600 dark:text-zinc-300 group"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectRecent(q)}
                    className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors truncate max-w-[200px]"
                  >
                    {q}
                  </button>
                  <button
                    type="button"
                    title="Remove from recent"
                    onClick={() => handleClearRecent(q)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Syntax help */}
      {showHelp && (
        <div className="p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700">
          <pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {SYNTAX_HELP}
          </pre>
        </div>
      )}
    </div>
  )
}

/** Toggle button to switch into query mode (rendered in normal filter view) */
export function QueryModeToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors py-1"
    >
      <Keyboard size={12} />
      <span>Query Mode</span>
    </button>
  )
}
