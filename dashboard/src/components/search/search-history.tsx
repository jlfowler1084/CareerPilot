"use client"

import { useState, useRef, useEffect } from "react"
import { format, isToday, isYesterday } from "date-fns"
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

// ── Profile chip colors ─────────────────────────────────────────────

const PROFILE_CHIP_COLORS: Record<string, string> = {
  "Sys Admin — Indy": "bg-blue-50 text-blue-600 border-blue-200",
  "Systems Engineer — Indy": "bg-violet-50 text-violet-600 border-violet-200",
  "DevOps / Cloud — Indy": "bg-cyan-50 text-cyan-600 border-cyan-200",
  "PowerShell / Automation — Remote": "bg-amber-50 text-amber-600 border-amber-200",
  "Infrastructure — Remote": "bg-emerald-50 text-emerald-600 border-emerald-200",
  "MSP / IT Services — Indy": "bg-pink-50 text-pink-600 border-pink-200",
  "Contract — Infrastructure": "bg-orange-50 text-orange-600 border-orange-200",
  "AD / Identity — Remote": "bg-indigo-50 text-indigo-600 border-indigo-200",
}

function ProfileChip({ label }: { label: string }) {
  const color = PROFILE_CHIP_COLORS[label] || "bg-zinc-50 text-zinc-500 border-zinc-200"
  // Shorten label for compact display
  const short = label.replace(/ — (Indy|Remote)/, "")
  return (
    <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${color}`}>
      {short}
    </span>
  )
}

// ── Friendly date format ────────────────────────────────────────────

function formatRunDate(dateStr: string): string {
  const d = new Date(dateStr)
  const time = format(d, "h:mm a")
  if (isToday(d)) return `Today ${time}`
  if (isYesterday(d)) return `Yesterday ${time}`
  return format(d, "MMM d") + ` ${time}`
}

// ── Props ───────────────────────────────────────────────────────────

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  // Measure content height for smooth animation
  useEffect(() => {
    if (open && contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [open, runs.length, loading])

  if (runs.length === 0) return null

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-2.5 px-4 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100/60 transition-colors"
      >
        <History size={14} className="text-zinc-400" />
        <span>Search History</span>
        <span className="text-xs text-zinc-400 font-normal">
          {runs.length} {runs.length === 1 ? "scan" : "scans"} saved
        </span>
        <span className="ml-auto">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {/* Animated expand/collapse */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? `${contentHeight + 50}px` : "0px" }}
      >
        <div ref={contentRef} className="border-t border-zinc-200/60">
          {loading && (
            <div className="flex items-center justify-center py-4 text-zinc-400">
              <Loader2 size={16} className="animate-spin mr-2" />
              <span className="text-xs">Loading history…</span>
            </div>
          )}

          {!loading && (
            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100/60">
              {runs.map((run) => {
                const isActive = run.id === activeRunId
                const isConfirmingDelete = confirmDeleteId === run.id
                return (
                  <div
                    key={run.id}
                    onClick={() => onSelectRun(run.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectRun(run.id) } }}
                    tabIndex={0}
                    className={`w-full text-left px-4 py-2.5 hover:bg-white transition-colors group cursor-pointer ${
                      isActive
                        ? "bg-amber-50/80 border-l-2 border-l-amber-400"
                        : "border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Timestamp + result badge */}
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span
                                  className={`text-xs font-medium ${
                                    isActive ? "text-amber-700" : "text-zinc-600"
                                  }`}
                                />
                              }
                            >
                              {formatRunDate(run.created_at)}
                            </TooltipTrigger>
                            <TooltipContent>
                              {format(new Date(run.created_at), "MMM d, yyyy 'at' h:mm a")}
                            </TooltipContent>
                          </Tooltip>
                          <span className="text-[10px] font-medium text-zinc-400">
                            {run.total_results} jobs
                          </span>
                          {run.new_count > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-500">
                              +{run.new_count} new
                            </span>
                          )}
                        </div>

                        {/* Source breakdown */}
                        {(run.dice_count > 0 || run.indeed_count > 0) && (
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            {run.dice_count > 0 && `${run.dice_count} Dice`}
                            {run.dice_count > 0 && run.indeed_count > 0 && " · "}
                            {run.indeed_count > 0 && `${run.indeed_count} Indeed`}
                          </p>
                        )}

                        {/* Profile chips */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {run.profiles_used.map((label) => (
                            <ProfileChip key={label} label={label} />
                          ))}
                        </div>
                      </div>

                      {/* Delete button with confirmation */}
                      <div className="shrink-0 flex items-center">
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteRun(run.id)
                                setConfirmDeleteId(null)
                              }}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmDeleteId(null)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded text-zinc-400 hover:text-zinc-600 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmDeleteId(run.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-zinc-300 hover:text-red-400 transition-all"
                            title="Delete this scan"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Clear all footer with confirmation */}
          {!loading && runs.length > 1 && (
            <div className="border-t border-zinc-200/60 px-4 py-2 flex items-center gap-2">
              {confirmClearAll ? (
                <>
                  <span className="text-[10px] text-red-500">Delete all {runs.length} scans?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll()
                      setConfirmClearAll(false)
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 transition-colors"
                  >
                    Yes, clear all
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="text-[10px] px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                >
                  Clear All History
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
