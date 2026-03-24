"use client"

import { Play, Square, Loader2 } from "lucide-react"

interface SearchControlsProps {
  onRun: () => void
  onStop: () => void
  loading: boolean
  progress: { current: number; total: number }
  searchComplete: boolean
  resultCount: number
  disabled?: boolean
}

export function SearchControls({
  onRun,
  onStop,
  loading,
  progress,
  searchComplete,
  resultCount,
  disabled,
}: SearchControlsProps) {
  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0

  return (
    <div className="flex items-center gap-3">
      {!loading ? (
        <button
          onClick={onRun}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Play size={14} />
          Run Search
        </button>
      ) : (
        <button
          onClick={onStop}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors shadow-sm"
        >
          <Square size={14} />
          Stop
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 flex-1">
          <Loader2 size={16} className="text-amber-500 animate-spin" />
          <div className="flex-1 max-w-xs">
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {progress.current}/{progress.total}
          </span>
        </div>
      )}

      {searchComplete && !loading && (
        <span className="text-xs text-zinc-500">
          {resultCount} results found
        </span>
      )}
    </div>
  )
}
