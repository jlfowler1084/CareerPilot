"use client"

import { Briefcase, Clock, MapPin, Zap } from "lucide-react"
import type { JobSearchResultRow } from "@/types/supabase"

interface ResultRowProps {
  row: JobSearchResultRow
  selected: boolean
  onSelect: (row: JobSearchResultRow) => void
}

const SOURCE_PILL: Record<string, { bg: string; text: string; border: string }> = {
  indeed: {
    bg: "bg-violet-50 dark:bg-violet-900/30",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200 dark:border-violet-700",
  },
  dice: {
    bg: "bg-indigo-50 dark:bg-indigo-900/30",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200 dark:border-indigo-700",
  },
}

function sourcePill(source: string) {
  return SOURCE_PILL[source.toLowerCase()] ?? SOURCE_PILL.indeed
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-500 text-white" },
  viewed: { label: "Viewed", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  tracked: { label: "Tracked", className: "bg-amber-500 text-zinc-900" },
  dismissed: { label: "Dismissed", className: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500" },
  stale: { label: "Stale", className: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500" },
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

export function ResultRow({ row, selected, onSelect }: ResultRowProps) {
  const pill = sourcePill(row.source)
  const status = STATUS_BADGE[row.status] ?? STATUS_BADGE.viewed

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className={`w-full text-left rounded-xl border p-4 transition-colors ${
        selected
          ? "border-amber-400 bg-amber-50/40 dark:bg-amber-900/10"
          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {row.title || "Untitled"}
            </h3>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded leading-none ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 truncate">
            {row.company || "Unknown company"}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            {row.location && (
              <span className="flex items-center gap-1">
                <MapPin size={11} /> {row.location}
              </span>
            )}
            {row.salary && (
              <span className="flex items-center gap-1">
                <Briefcase size={11} /> {row.salary}
              </span>
            )}
            {row.easy_apply && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Zap size={11} /> Easy Apply
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={11} /> {timeAgo(row.last_seen_at)}
            </span>
          </div>
        </div>
        <span
          className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border ${pill.bg} ${pill.text} ${pill.border}`}
        >
          {row.source}
        </span>
      </div>
      {row.profile_label && (
        <div className="mt-2 text-[10px] uppercase tracking-wider text-zinc-400">
          {row.profile_label}
        </div>
      )}
    </button>
  )
}
