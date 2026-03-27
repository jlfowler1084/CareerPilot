"use client"

import { useState } from "react"
import { formatDistanceToNow, format } from "date-fns"
import {
  ChevronDown,
  ChevronRight,
  History,
  Trash2,
  Loader2,
} from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import type { SearchRun } from "@/types"

interface SearchHistoryProps {
  runs: SearchRun[]
  activeRunId: string | null
  onSelectRun: (runId: string) => void
  onDeleteRun: (runId: string) => void
  onClearAll: () => void
  loading?: boolean
}

export function SearchHistory({
  runs,
  activeRunId,
  onSelectRun,
  onDeleteRun,
  onClearAll,
  loading,
}: SearchHistoryProps) {
  const [open, setOpen] = useState(false)

  if (runs.length === 0) return null

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-2.5 px-4 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
      >
        <History size={14} className="text-zinc-400" />
        <span>Search History</span>
        <span className="text-xs text-zinc-400 font-normal">
          ({runs.length} {runs.length === 1 ? "scan" : "scans"})
        </span>
        <span className="ml-auto">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {/* Expanded list */}
      {open && (
        <div className="border-t border-zinc-100">
          {loading && (
            <div className="flex items-center justify-center py-4 text-zinc-400">
              <Loader2 size={16} className="animate-spin mr-2" />
              <span className="text-xs">Loading history…</span>
            </div>
          )}

          {!loading && (
            <div className="max-h-64 overflow-y-auto divide-y divide-zinc-50">
              {runs.map((run) => {
                const isActive = run.id === activeRunId
                return (
                  <button
                    key={run.id}
                    onClick={() => onSelectRun(run.id)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-zinc-50 transition-colors group ${
                      isActive ? "bg-amber-50/60 border-l-2 border-l-amber-400" : "border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Active indicator */}
                      <span className={`mt-1 text-xs ${isActive ? "text-amber-500" : "text-zinc-300"}`}>
                        {isActive ? "●" : "○"}
                      </span>

                      <div className="flex-1 min-w-0">
                        {/* Timestamp */}
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className={`text-xs font-medium ${isActive ? "text-amber-700" : "text-zinc-600"}`} />
                            }
                          >
                            {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                          </TooltipTrigger>
                          <TooltipContent>
                            {format(new Date(run.created_at), "MMM d, yyyy 'at' h:mm a")}
                          </TooltipContent>
                        </Tooltip>

                        {/* Profiles used */}
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {run.profiles_used.join(", ")}
                        </p>

                        {/* Result counts */}
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {run.total_results} results
                          {(run.dice_count > 0 || run.indeed_count > 0) && (
                            <span>
                              {" — "}
                              {run.dice_count > 0 && `${run.dice_count} Dice`}
                              {run.dice_count > 0 && run.indeed_count > 0 && ", "}
                              {run.indeed_count > 0 && `${run.indeed_count} Indeed`}
                            </span>
                          )}
                          {run.new_count > 0 && (
                            <span className="text-emerald-500 ml-1">
                              ({run.new_count} new)
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Delete button — not on active run */}
                      {!isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteRun(run.id)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-zinc-300 hover:text-red-400 transition-all"
                          title="Delete this scan"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Clear all footer */}
          {!loading && runs.length > 1 && (
            <div className="border-t border-zinc-100 px-4 py-2">
              <button
                onClick={onClearAll}
                className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
              >
                Clear All History
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
