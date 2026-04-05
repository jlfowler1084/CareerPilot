"use client"

import { useState, useMemo } from "react"
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react"
import type { DebriefRecord } from "@/types"

interface CrossAppPatternsProps {
  allDebriefs: DebriefRecord[]
}

export function CrossAppPatterns({ allDebriefs }: CrossAppPatternsProps) {
  const [open, setOpen] = useState(false)

  const patterns = useMemo(() => {
    if (allDebriefs.length < 2) return null

    // Aggregate topics_covered
    const topicCounts: Record<string, number> = {}
    for (const d of allDebriefs) {
      for (const t of d.topics_covered || []) {
        topicCounts[t] = (topicCounts[t] || 0) + 1
      }
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    // Aggregate strengths from ai_analysis
    const strengthCounts: Record<string, number> = {}
    const gapCounts: Record<string, number> = {}

    for (const d of allDebriefs) {
      const analysis = d.ai_analysis as Record<string, unknown> | null
      if (!analysis) continue

      const strengths = (analysis.strengths as string[]) || (analysis.strong_points as string[]) || []
      for (const s of strengths) {
        strengthCounts[s] = (strengthCounts[s] || 0) + 1
      }

      const gaps = (analysis.improvement_areas as string[]) || []
      for (const g of gaps) {
        gapCounts[g] = (gapCounts[g] || 0) + 1
      }
    }

    const recurringStrengths = Object.entries(strengthCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const recurringGaps = Object.entries(gapCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return { topTopics, recurringStrengths, recurringGaps }
  }, [allDebriefs])

  if (!patterns) return null

  const { topTopics, recurringStrengths, recurringGaps } = patterns

  if (topTopics.length === 0 && recurringStrengths.length === 0 && recurringGaps.length === 0) {
    return null
  }

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
      >
        {open ? (
          <ChevronDown size={10} className="text-zinc-400" />
        ) : (
          <ChevronRight size={10} className="text-zinc-400" />
        )}
        <TrendingUp size={10} className="text-purple-500" />
        <span className="text-[10px] font-semibold text-zinc-500">
          Cross-Interview Patterns
        </span>
        <span className="text-[10px] text-zinc-400">
          ({allDebriefs.length} debriefs)
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-zinc-100 pt-2">
          {/* Top topics */}
          {topTopics.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-zinc-500">Most Asked Topics:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {topTopics.map(([topic, count]) => (
                  <span
                    key={topic}
                    className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded"
                  >
                    {topic} ({count}x)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recurring strengths */}
          {recurringStrengths.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-emerald-600">Recurring Strengths:</span>
              <ul className="mt-0.5">
                {recurringStrengths.map(([strength, count]) => (
                  <li key={strength} className="text-xs text-zinc-700">
                    - {strength} ({count}x)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recurring gaps */}
          {recurringGaps.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-amber-600">Recurring Gaps:</span>
              <ul className="mt-0.5">
                {recurringGaps.map(([gap, count]) => (
                  <li key={gap} className="text-xs text-zinc-700">
                    - {gap} ({count}x)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
