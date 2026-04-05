"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import { useCoaching } from "@/hooks/use-coaching"
import { useDebriefs } from "@/hooks/use-debriefs"
import { CoachingReport } from "@/components/coaching/coaching-report"
import { PracticeMode } from "@/components/coaching/practice-mode"
import { DebriefHistory } from "@/components/coaching/debrief-history"
import type { Application, DebriefRecord } from "@/types"

interface CoachingSectionProps {
  application: Application
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-emerald-600"
  if (score >= 4) return "text-amber-500"
  return "text-red-500"
}

export function CoachingSection({ application }: CoachingSectionProps) {
  const {
    latestSession,
    analyzing,
    practicing,
    evaluating,
    error,
    analyzeDebrief,
    startPractice,
    evaluateAnswer,
  } = useCoaching(application.id)

  const { debriefs, loading: debriefsLoading, addDebrief } = useDebriefs(application.id)

  const [open, setOpen] = useState(false)
  const [debriefOpen, setDebriefOpen] = useState(false)
  const [debriefText, setDebriefText] = useState("")
  const [reportOpen, setReportOpen] = useState(false)
  const [practiceOpen, setPracticeOpen] = useState(false)

  async function handleAnalyzeDebrief() {
    if (!debriefText.trim()) return
    const session = await analyzeDebrief(debriefText)
    if (session) {
      // If the API returned a debrief record, add it to local state
      const resp = session as unknown as Record<string, unknown>
      if (resp.debrief) {
        addDebrief(resp.debrief as DebriefRecord)
      }
      toast.success(`Coaching complete — score: ${session.overall_score}/10`)
      setDebriefOpen(false)
      setDebriefText("")
      setReportOpen(true)
    }
  }

  async function handleSavePractice(notes: string) {
    await analyzeDebrief(notes)
  }

  return (
    <div className="border-t border-zinc-100 mt-3 pt-3">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {open ? (
          <ChevronDown size={12} className="text-zinc-400" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400" />
        )}
        <Brain size={12} className="text-blue-500" />
        <span className="text-xs font-semibold text-zinc-500 group-hover:text-zinc-700">
          Performance Coach
        </span>
        {latestSession && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-50 ${scoreColor(latestSession.overall_score)}`}>
            {latestSession.overall_score}/10
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-700 flex-1">{error}</span>
            </div>
          )}

          {/* Latest report summary */}
          {latestSession && !reportOpen && (
            <div className="bg-zinc-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-lg font-bold ${scoreColor(latestSession.overall_score)}`}>
                  {latestSession.overall_score}/10
                </span>
                <span className="text-[10px] text-zinc-400">
                  {new Date(latestSession.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-zinc-600 line-clamp-2">
                {latestSession.ai_analysis?.summary || "No summary"}
              </p>
              <button
                onClick={() => setReportOpen(true)}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 mt-1.5"
              >
                View Full Report
              </button>
            </div>
          )}

          {/* Full report */}
          {latestSession && reportOpen && (
            <div>
              <button
                onClick={() => setReportOpen(false)}
                className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-700 mb-2"
              >
                &larr; Collapse Report
              </button>
              <CoachingReport session={latestSession} />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setDebriefOpen(!debriefOpen)}
              className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              Analyze Debrief
            </button>
            <button
              onClick={() => setPracticeOpen(!practiceOpen)}
              className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              Practice for This Role
            </button>
          </div>

          {/* Debrief history timeline (CAR-127) */}
          <DebriefHistory
            debriefs={debriefs}
            loading={debriefsLoading}
            company={application.company}
            title={application.title}
          />

          {/* Debrief textarea */}
          {debriefOpen && (
            <div className="space-y-2">
              <textarea
                value={debriefText}
                onChange={(e) => setDebriefText(e.target.value)}
                placeholder="Paste your interview debrief notes, transcript, or practice session content here..."
                className="w-full h-32 text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-300 text-zinc-700"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAnalyzeDebrief}
                  disabled={analyzing || !debriefText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {analyzing ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Analyze"
                  )}
                </button>
                <button
                  onClick={() => { setDebriefOpen(false); setDebriefText("") }}
                  className="text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Practice mode */}
          {practiceOpen && (
            <PracticeMode
              applicationId={application.id}
              onStartPractice={startPractice}
              onEvaluate={evaluateAnswer}
              onSaveSession={handleSavePractice}
              practicing={practicing}
              evaluating={evaluating}
            />
          )}
        </div>
      )}
    </div>
  )
}
