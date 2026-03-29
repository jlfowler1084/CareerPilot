"use client"

import { useState, useMemo } from "react"
import { RefreshCw, Plus, X, ExternalLink, Mail, ListChecks } from "lucide-react"
import { FitScoreBadge } from "@/components/search/fit-score-badge"
import type { Suggestion } from "@/hooks/use-suggestions"
import type { FitScore } from "@/types"

type SortOption = "newest" | "fit_score" | "source"

interface SuggestionsFeedProps {
  suggestions: Suggestion[]
  loading: boolean
  newCount: number
  onExtract: () => Promise<{ processed: number; found: number }>
  onDismiss: (id: string) => void
  onTrack: (id: string) => void
  onBulkDismiss: (ids: string[]) => void
  getFitScore?: (suggestion: Suggestion) => FitScore | undefined
  onAddToQueue?: (suggestion: Suggestion) => void
  isInQueue?: (suggestion: Suggestion) => boolean
}

const SOURCE_COLORS: Record<string, { bg: string; text: string; border: string; left: string }> = {
  Indeed: { bg: "bg-violet-50 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-700", left: "#7c3aed" },
  LinkedIn: { bg: "bg-purple-50 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-700", left: "#9333ea" },
  Glassdoor: { bg: "bg-fuchsia-50 dark:bg-fuchsia-900/30", text: "text-fuchsia-700 dark:text-fuchsia-300", border: "border-fuchsia-200 dark:border-fuchsia-700", left: "#c026d3" },
  Dice: { bg: "bg-indigo-50 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-700", left: "#4f46e5" },
}

function getSourceStyle(source: string) {
  return SOURCE_COLORS[source] || SOURCE_COLORS.Indeed
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return "just now"
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "1 day ago"
  return `${days} days ago`
}

export function SuggestionsFeed({
  suggestions,
  loading,
  newCount,
  onExtract,
  onDismiss,
  onTrack,
  onBulkDismiss,
  getFitScore,
  onAddToQueue,
  isInQueue,
}: SuggestionsFeedProps) {
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const hasScores = !!getFitScore
  const [sortBy, setSortBy] = useState<SortOption>(hasScores ? "fit_score" : "newest")

  const filtered = useMemo(() => {
    let list = suggestions
    if (sourceFilter !== "all") {
      list = list.filter((s) => s.source === sourceFilter)
    }
    if (statusFilter === "new") {
      list = list.filter((s) => s.status === "new")
    }
    // Sort
    if (sortBy === "fit_score" && getFitScore) {
      list = [...list].sort((a, b) => {
        const sa = getFitScore(a)?.total ?? 0
        const sb = getFitScore(b)?.total ?? 0
        if (sb !== sa) return sb - sa
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    } else if (sortBy === "source") {
      list = [...list].sort((a, b) => a.source.localeCompare(b.source))
    }
    // "newest" is the default order from the API (created_at desc)
    return list
  }, [suggestions, sourceFilter, statusFilter, sortBy, getFitScore])

  const sources = useMemo(() => {
    const set = new Set(suggestions.map((s) => s.source))
    return [...set].sort()
  }, [suggestions])

  async function handleExtract() {
    setExtracting(true)
    setExtractResult(null)
    try {
      const result = await onExtract()
      if (result.found > 0) {
        setExtractResult(`Found ${result.found} new suggestion${result.found !== 1 ? "s" : ""}`)
      } else if (result.processed > 0) {
        setExtractResult("No new suggestions found")
      } else {
        setExtractResult("No unprocessed alert emails")
      }
    } catch {
      setExtractResult("Extraction failed")
    }
    setExtracting(false)
    setTimeout(() => setExtractResult(null), 5000)
  }

  function handleDismissAllRead() {
    const readIds = suggestions.filter((s) => s.status !== "new").map((s) => s.id)
    if (readIds.length > 0) onBulkDismiss(readIds)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Job Suggestions from Email
          </h3>
          {newCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
              {newCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {extractResult && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{extractResult}</span>
          )}
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={extracting ? "animate-spin" : ""} />
            {extracting ? "Scanning..." : "Refresh"}
          </button>
          {suggestions.some((s) => s.status !== "new") && (
            <button
              type="button"
              onClick={handleDismissAllRead}
              className="text-[10px] font-semibold text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Dismiss Read
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {suggestions.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">Source</span>
            <FilterChip label="All" active={sourceFilter === "all"} onClick={() => setSourceFilter("all")} />
            {sources.map((s) => (
              <FilterChip key={s} label={s} active={sourceFilter === s} onClick={() => setSourceFilter(s)} />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">Status</span>
            <FilterChip label="All" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
            <FilterChip label="New" active={statusFilter === "new"} onClick={() => setStatusFilter("new")} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">Sort</span>
            <FilterChip label="Newest" active={sortBy === "newest"} onClick={() => setSortBy("newest")} />
            {hasScores && <FilterChip label="Fit Score" active={sortBy === "fit_score"} onClick={() => setSortBy("fit_score")} />}
            <FilterChip label="Source" active={sortBy === "source"} onClick={() => setSortBy("source")} />
          </div>
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtered.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onDismiss={() => onDismiss(s.id)}
              onTrack={() => onTrack(s.id)}
              fitScore={getFitScore?.(s)}
              onAddToQueue={onAddToQueue ? () => onAddToQueue(s) : undefined}
              inQueue={isInQueue?.(s) ?? false}
            />
          ))}
        </div>
      ) : suggestions.length > 0 ? (
        <div className="text-center py-8 text-zinc-400 dark:text-zinc-500">
          <p className="text-sm">No suggestions match this filter</p>
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 space-y-2">
          <Mail size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">No job suggestions yet</p>
          <p className="text-xs">
            Suggestions are extracted from job alert emails in your inbox.
            <br />Click <strong>Refresh</strong> to scan recent alerts.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Suggestion Card ─────────────────────────────────

function SuggestionCard({
  suggestion: s,
  onDismiss,
  onTrack,
  fitScore,
  onAddToQueue,
  inQueue,
}: {
  suggestion: Suggestion
  onDismiss: () => void
  onTrack: () => void
  fitScore?: FitScore
  onAddToQueue?: () => void
  inQueue: boolean
}) {
  const style = getSourceStyle(s.source)
  const isNew = s.status === "new"
  const isTracked = s.status === "interested"
  const canQueue = !!onAddToQueue

  return (
    <div
      className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 hover:shadow-md transition-all hover:-translate-y-px"
      style={{ borderLeft: `4px solid ${isNew ? "#f59e0b" : style.left}` }}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 leading-tight">
              {s.title}
            </span>
            {fitScore && <FitScoreBadge score={fitScore} />}
            {isNew && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                NEW
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
            {s.company}
            {s.location ? ` · ${s.location}` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.salary && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                {s.salary}
              </span>
            )}
            {s.description && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 line-clamp-2 mt-1 w-full">
                {s.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${style.bg} ${style.text} border ${style.border}`}>
            {s.source} Alert
          </span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
            {timeAgo(s.created_at)}
          </span>

          {!isTracked ? (
            <div className="flex flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={onTrack}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-700 transition-colors flex items-center gap-1"
              >
                <Plus size={10} /> Track
              </button>
              {canQueue && !inQueue && (
                s.job_url ? (
                  <button
                    type="button"
                    onClick={onAddToQueue}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700 transition-colors flex items-center gap-1"
                  >
                    <ListChecks size={10} /> Queue
                  </button>
                ) : (
                  <span
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700 flex items-center gap-1 cursor-default"
                    title="No job URL available"
                  >
                    <ListChecks size={10} /> Queue
                  </span>
                )
              )}
              {inQueue && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 flex items-center gap-1">
                  <ListChecks size={10} /> Queued
                </span>
              )}
              {s.job_url && (
                <a
                  href={s.job_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700 transition-colors flex items-center gap-1"
                >
                  <ExternalLink size={10} /> Apply
                </a>
              )}
              <button
                type="button"
                onClick={onDismiss}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
              >
                <X size={10} /> Dismiss
              </button>
            </div>
          ) : (
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Tracking
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Filter Chip ─────────────────────────────────────

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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
