"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConversationPattern } from "@/types"

interface PatternInsightsProps {
  patterns: ConversationPattern | null
  loading: boolean
  error: string | null
  onFetch: () => void
}

export function PatternInsights({
  patterns,
  loading,
  error,
  onFetch,
}: PatternInsightsProps) {
  if (!patterns && !loading && !error) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-6 text-center">
        <p className="text-sm text-zinc-500 mb-3">
          Analyze your conversation history to find patterns, recurring
          questions, and areas to improve.
        </p>
        <Button onClick={onFetch}>Analyze Patterns</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-8 flex flex-col items-center gap-3">
        <Loader2 className="size-5 animate-spin text-amber-600" />
        <p className="text-sm text-zinc-500">
          Analyzing conversation patterns...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="text-sm text-red-700">{error}</p>
        <Button variant="outline" size="sm" onClick={onFetch} className="mt-2">
          Retry
        </Button>
      </div>
    )
  }

  if (!patterns) return null

  return (
    <div className="space-y-4">
      {/* This Week */}
      {patterns.this_week && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-800 uppercase mb-1">
            This Week
          </p>
          <p className="text-sm text-amber-900">{patterns.this_week}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recurring Questions */}
        {patterns.recurring_questions.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase mb-3">
              Recurring Questions
            </p>
            <div className="space-y-2">
              {patterns.recurring_questions.map((q, i) => (
                <div key={i} className="bg-zinc-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-zinc-800">
                    {q.question}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Asked by {q.companies.join(", ")} ({q.count}x)
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strongest Topics */}
        {patterns.strongest_topics.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase mb-3">
              Strongest Topics
            </p>
            <div className="space-y-2">
              {patterns.strongest_topics.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2"
                >
                  <span className="text-sm font-medium text-emerald-800">
                    {t.topic}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-600">
                      {t.count}x
                    </span>
                    <span className="text-xs">
                      {"\u2B50".repeat(Math.round(t.avg_sentiment))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weak Areas */}
        {patterns.weak_areas.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-4 md:col-span-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase mb-3">
              Areas to Improve
            </p>
            <div className="space-y-2">
              {patterns.weak_areas.map((w, i) => (
                <div key={i} className="bg-orange-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-orange-800">
                    {w.area}
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    {w.suggestion}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onFetch}>
          Refresh Analysis
        </Button>
      </div>
    </div>
  )
}
