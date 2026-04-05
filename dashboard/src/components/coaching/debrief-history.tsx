"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Download,
  Clock,
  FileText,
} from "lucide-react"
import { CoachingReport } from "@/components/coaching/coaching-report"
import { exportDebriefMarkdown } from "@/lib/export-debrief"
import type { DebriefRecord, CoachingSession } from "@/types"

interface DebriefHistoryProps {
  debriefs: DebriefRecord[]
  loading: boolean
  company: string
  title: string
}

function debriefToSession(debrief: DebriefRecord): CoachingSession {
  const analysis = debrief.ai_analysis as Record<string, unknown> | null
  return {
    id: debrief.id,
    application_id: debrief.application_id,
    user_id: debrief.user_id,
    session_type: "debrief",
    raw_input: "",
    ai_analysis: {
      summary: (analysis?.summary as string) || "",
      question_analyses: (analysis?.question_analyses as CoachingSession["ai_analysis"]["question_analyses"]) || [],
    },
    overall_score: (analysis?.overall_score as number) || 0,
    strong_points: (analysis?.strong_points as string[]) || [],
    improvements: (analysis?.improvements as CoachingSession["improvements"]) || [],
    patterns_detected: (analysis?.patterns_detected as CoachingSession["patterns_detected"]) || {
      rambling: false,
      hedging_count: 0,
      filler_words: {},
      vague_answers: 0,
      missing_star: false,
      specificity_score: 0,
      confidence_score: 0,
    },
    created_at: debrief.created_at,
  }
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-emerald-600"
  if (score >= 4) return "text-amber-500"
  return "text-red-500"
}

export function DebriefHistory({ debriefs, loading, company, title }: DebriefHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(
    debriefs.length > 0 ? debriefs[0].id : null
  )

  if (loading) {
    return (
      <div className="text-[10px] text-zinc-400 py-2">Loading debriefs...</div>
    )
  }

  if (debriefs.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 px-3 bg-zinc-50 rounded-lg">
        <FileText size={12} className="text-zinc-300" />
        <span className="text-[10px] text-zinc-400">
          No debriefs yet. Run your first analysis above.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-semibold text-zinc-500 flex items-center gap-1.5">
        <Clock size={10} />
        Debrief History ({debriefs.length})
      </h4>
      <div className="space-y-1.5">
        {debriefs.map((debrief) => {
          const analysis = debrief.ai_analysis as Record<string, unknown> | null
          const score = (analysis?.overall_score as number) || 0
          const summary = (analysis?.summary as string) || "No summary"
          const isExpanded = expandedId === debrief.id

          return (
            <div
              key={debrief.id}
              className="border border-zinc-200 rounded-lg overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : debrief.id)}
                  className="flex items-center gap-2 flex-1 text-left hover:bg-zinc-50 -m-1 p-1 rounded transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={10} className="text-zinc-400" />
                  ) : (
                    <ChevronRight size={10} className="text-zinc-400" />
                  )}
                  <span className="text-[10px] text-zinc-400">
                    {new Date(debrief.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {debrief.stage && (
                    <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                      {debrief.stage}
                    </span>
                  )}
                  {score > 0 && (
                    <span className={`text-[10px] font-bold ${scoreColor(score)}`}>
                      {score}/10
                    </span>
                  )}
                </button>
                <button
                  onClick={() => exportDebriefMarkdown(debrief, { company, title })}
                  className="p-1 text-zinc-400 hover:text-blue-600 transition-colors"
                  title="Export as .md"
                >
                  <Download size={12} />
                </button>
              </div>

              {/* Summary line when collapsed */}
              {!isExpanded && (
                <p className="text-[10px] text-zinc-500 px-3 pb-2 line-clamp-1">
                  {summary}
                </p>
              )}

              {/* Expanded: full coaching report */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-zinc-100 pt-2">
                  <CoachingReport session={debriefToSession(debrief)} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
