"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ClipboardCheck,
  TrendingUp,
  AlertTriangle,
  Target,
} from "lucide-react"
import { toast } from "sonner"
import type { CoachingSession } from "@/types"

interface CoachingReportProps {
  session: CoachingSession
}

const ISSUE_COLORS: Record<string, string> = {
  rambling: "bg-orange-100 text-orange-700",
  hedging: "bg-yellow-100 text-yellow-700",
  vague: "bg-red-100 text-red-700",
  "off-topic": "bg-purple-100 text-purple-700",
  "no-star": "bg-blue-100 text-blue-700",
  "technical-gap": "bg-rose-100 text-rose-700",
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-emerald-600"
  if (score >= 4) return "text-amber-500"
  return "text-red-500"
}

function scoreBg(score: number): string {
  if (score >= 7) return "bg-emerald-50 border-emerald-200"
  if (score >= 4) return "bg-amber-50 border-amber-200"
  return "bg-red-50 border-red-200"
}

export function CoachingReport({ session }: CoachingReportProps) {
  const analysis = session.ai_analysis
  const patterns = session.patterns_detected

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className={`flex items-center gap-4 rounded-lg border p-4 ${scoreBg(session.overall_score)}`}>
        <span className={`text-4xl font-bold ${scoreColor(session.overall_score)}`}>
          {session.overall_score}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-700">Overall Score</p>
          <p className="text-xs text-zinc-500">{analysis?.summary || "No summary available"}</p>
        </div>
      </div>

      {/* Strong Points */}
      {session.strong_points && session.strong_points.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
            <TrendingUp size={12} />
            Strong Points
          </h4>
          <div className="grid gap-2">
            {session.strong_points.map((point, i) => (
              <div key={i} className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {point}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Question Analyses */}
      {analysis?.question_analyses && analysis.question_analyses.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-zinc-600">Question Breakdown</h4>
          {analysis.question_analyses.map((qa, i) => (
            <QuestionCard key={i} qa={qa} />
          ))}
        </div>
      )}

      {/* Pattern Summary */}
      {patterns && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
            <AlertTriangle size={12} />
            Pattern Analysis
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <PatternStat label="Specificity" value={`${patterns.specificity_score}/10`} />
            <PatternStat label="Confidence" value={`${patterns.confidence_score}/10`} />
            <PatternStat label="Hedging phrases" value={String(patterns.hedging_count)} />
            <PatternStat label="Vague answers" value={String(patterns.vague_answers)} />
            <PatternStat label="Rambling" value={patterns.rambling ? "Yes" : "No"} />
            <PatternStat label="STAR format" value={patterns.missing_star ? "Missing" : "Present"} />
          </div>
          {Object.keys(patterns.filler_words).length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold text-zinc-500 mb-1">Filler Words</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(patterns.filler_words).map(([word, count]) => (
                  <span key={word} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
                    &ldquo;{word}&rdquo; x{count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top 3 Focus Areas */}
      {analysis && "top_3_focus_areas" in analysis && Array.isArray((analysis as Record<string, unknown>).top_3_focus_areas) && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
            <Target size={12} />
            Top Focus Areas
          </h4>
          <div className="space-y-1.5">
            {((analysis as Record<string, unknown>).top_3_focus_areas as string[]).map((area, i) => (
              <div key={i} className="text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-800">
                <span className="font-bold mr-1">{i + 1}.</span> {area}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-zinc-400 text-right">
        {new Date(session.created_at).toLocaleDateString()} &middot; {session.session_type}
      </p>
    </div>
  )
}

function PatternStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 rounded px-2.5 py-1.5">
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className="text-xs font-semibold text-zinc-700">{value}</p>
    </div>
  )
}

function QuestionCard({ qa }: { qa: { question: string; your_answer: string; score: number; feedback: string; coached_answer: string; issues: string[] } }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(qa.coached_answer)
    setCopied(true)
    toast.success("Coached answer copied")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-3 py-2.5 hover:bg-zinc-50 transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="text-xs font-medium text-zinc-700 flex-1 truncate">{qa.question}</span>
        <span className={`text-xs font-bold ${scoreColor(qa.score)}`}>{qa.score}/10</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Your answer */}
          <div className="bg-zinc-50 rounded p-2.5">
            <p className="text-[10px] font-semibold text-zinc-400 mb-1">Your Answer</p>
            <p className="text-xs text-zinc-600">{qa.your_answer}</p>
          </div>

          {/* Issues */}
          {qa.issues && qa.issues.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {qa.issues.map((issue) => (
                <span
                  key={issue}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ISSUE_COLORS[issue] || "bg-zinc-100 text-zinc-600"}`}
                >
                  {issue}
                </span>
              ))}
            </div>
          )}

          {/* Coached answer */}
          <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 relative">
            <p className="text-[10px] font-semibold text-emerald-600 mb-1">Coached Answer</p>
            <p className="text-xs text-emerald-800">{qa.coached_answer}</p>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 text-emerald-400 hover:text-emerald-600"
              title="Copy coached answer"
            >
              {copied ? <ClipboardCheck size={12} /> : <Copy size={12} />}
            </button>
          </div>

          {/* Feedback */}
          <p className="text-xs text-zinc-600">{qa.feedback}</p>
        </div>
      )}
    </div>
  )
}
