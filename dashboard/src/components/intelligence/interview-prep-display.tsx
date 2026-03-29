"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Eye,
  EyeOff,
  MessageSquare,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
  BookOpen,
  Sparkles,
} from "lucide-react"
import type { InterviewPrepData } from "@/lib/intelligence/generators/interview-prep"

// ── Types ───────────────────────────────────────────────────────────

interface PrepEntry {
  stage: string
  prep_data: InterviewPrepData
  generated_at: string
  model_used: string
  generation_cost_cents: number
}

interface InterviewPrepDisplayProps {
  preps: PrepEntry[]
  onRegenerate: (stage: string) => void
  isRegenerating: boolean
}

// ── Constants ───────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  phone_screen: "Phone Screen",
  technical: "Technical",
  hiring_manager: "Hiring Manager",
  final_round: "Final Round",
  offer: "Offer",
}

const STAGE_PILL_COLORS: Record<string, string> = {
  phone_screen: "bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100",
  technical: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
  hiring_manager: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  final_round: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100",
  offer: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
}

const STAGE_ACTIVE_COLORS: Record<string, string> = {
  phone_screen: "bg-pink-100 text-pink-800 border-pink-300 ring-1 ring-pink-300",
  technical: "bg-violet-100 text-violet-800 border-violet-300 ring-1 ring-violet-300",
  hiring_manager: "bg-blue-100 text-blue-800 border-blue-300 ring-1 ring-blue-300",
  final_round: "bg-indigo-100 text-indigo-800 border-indigo-300 ring-1 ring-indigo-300",
  offer: "bg-emerald-100 text-emerald-800 border-emerald-300 ring-1 ring-emerald-300",
}

const CATEGORY_COLORS: Record<string, string> = {
  behavioral: "bg-blue-50 text-blue-600 border-blue-200",
  technical: "bg-violet-50 text-violet-600 border-violet-200",
  situational: "bg-amber-50 text-amber-600 border-amber-200",
  culture_fit: "bg-emerald-50 text-emerald-600 border-emerald-200",
}

const CATEGORY_LABELS: Record<string, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  situational: "Situational",
  culture_fit: "Culture Fit",
}

// ── Component ───────────────────────────────────────────────────────

export function InterviewPrepDisplay({
  preps,
  onRegenerate,
  isRegenerating,
}: InterviewPrepDisplayProps) {
  const [activeStage, setActiveStage] = useState(preps[0]?.stage || "")
  const [practiceMode, setPracticeMode] = useState(false)
  const [tipsOpen, setTipsOpen] = useState(false)

  const activePrep = preps.find((p) => p.stage === activeStage)
  const data = activePrep?.prep_data

  if (!data) return null

  return (
    <div className="space-y-3">
      {/* Stage pills */}
      <div className="flex flex-wrap gap-1.5">
        {preps.map((p) => {
          const isActive = p.stage === activeStage
          const colors = isActive
            ? STAGE_ACTIVE_COLORS[p.stage] || "bg-zinc-200 text-zinc-800 border-zinc-300 ring-1 ring-zinc-300"
            : STAGE_PILL_COLORS[p.stage] || "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
          return (
            <button
              key={p.stage}
              onClick={() => setActiveStage(p.stage)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${colors}`}
            >
              {STAGE_LABELS[p.stage] || p.stage}
            </button>
          )
        })}
      </div>

      {/* Practice mode toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setPracticeMode(!practiceMode)}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all ${
            practiceMode
              ? "bg-amber-100 text-amber-800 border-amber-300"
              : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100"
          }`}
        >
          {practiceMode ? <EyeOff size={11} /> : <Eye size={11} />}
          Practice Mode {practiceMode ? "ON" : "OFF"}
        </button>
        {practiceMode && (
          <span className="text-[10px] text-amber-600 italic">
            Answers hidden — think before revealing
          </span>
        )}
      </div>

      {/* Career Narrative Angle */}
      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
        <div className="flex items-start gap-2">
          <Sparkles size={12} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
              Career Narrative Angle
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              {data.career_narrative_angle}
            </p>
          </div>
        </div>
      </div>

      {/* Likely Questions */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <MessageSquare size={12} className="text-zinc-500" />
          <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wide">
            Likely Questions ({data.likely_questions.length})
          </p>
        </div>
        <div className="space-y-2">
          {data.likely_questions.map((q, i) => (
            <QuestionCard
              key={i}
              question={q.question}
              category={q.category}
              suggestedApproach={q.suggested_approach}
              practiceMode={practiceMode}
            />
          ))}
        </div>
      </div>

      {/* Gaps to Address */}
      {data.gaps_to_address.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={12} className="text-amber-500" />
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wide">
              Gaps to Address ({data.gaps_to_address.length})
            </p>
          </div>
          <div className="space-y-1.5">
            {data.gaps_to_address.map((g, i) => (
              <div
                key={i}
                className="p-2 rounded-md bg-amber-50/70 border border-amber-100 hover:border-amber-200 transition-colors"
              >
                <p className="text-xs font-medium text-amber-800">{g.gap}</p>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                  {g.mitigation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Talking Points */}
      {data.talking_points.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb size={12} className="text-zinc-500" />
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wide">
              Talking Points
            </p>
          </div>
          <ul className="space-y-1">
            {data.talking_points.map((t, i) => (
              <li
                key={i}
                className="text-xs text-zinc-700 leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-zinc-300"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Questions to Ask */}
      {data.questions_to_ask.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <HelpCircle size={12} className="text-zinc-500" />
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wide">
              Questions to Ask ({data.questions_to_ask.length})
            </p>
          </div>
          <div className="space-y-1.5">
            {data.questions_to_ask.map((q, i) => (
              <div
                key={i}
                className="p-2 rounded-md bg-zinc-50 border border-zinc-100 hover:border-zinc-200 transition-colors"
              >
                <p className="text-xs font-medium text-zinc-800">
                  {q.question}
                </p>
                {!practiceMode && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 italic leading-relaxed">
                    {q.why}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage-Specific Tips (collapsible) */}
      {data.stage_specific_tips.length > 0 && (
        <div className="border border-zinc-100 rounded-md overflow-hidden">
          <button
            onClick={() => setTipsOpen(!tipsOpen)}
            className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left hover:bg-zinc-50 transition-colors"
          >
            {tipsOpen ? (
              <ChevronDown size={10} className="text-zinc-400" />
            ) : (
              <ChevronRight size={10} className="text-zinc-400" />
            )}
            <BookOpen size={11} className="text-zinc-500" />
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wide">
              Stage Tips ({data.stage_specific_tips.length})
            </span>
          </button>
          {tipsOpen && (
            <ul className="px-2.5 pb-2.5 space-y-1 border-t border-zinc-50">
              {data.stage_specific_tips.map((tip, i) => (
                <li
                  key={i}
                  className="text-xs text-zinc-600 leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-300"
                >
                  {tip}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Footer: metadata + regenerate */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
        <div className="text-[10px] text-zinc-400 space-x-2">
          <span>{activePrep?.model_used}</span>
          <span>&middot;</span>
          <span>{activePrep?.generation_cost_cents}¢</span>
          <span>&middot;</span>
          <span>
            {activePrep
              ? new Date(activePrep.generated_at).toLocaleDateString()
              : ""}
          </span>
        </div>
        <button
          onClick={() => onRegenerate(activeStage)}
          disabled={isRegenerating}
          className="text-[10px] font-semibold px-2 py-1 rounded-md text-zinc-400 hover:text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw size={10} className={isRegenerating ? "animate-spin" : ""} />
          Regenerate
        </button>
      </div>
    </div>
  )
}

// ── Question Card ───────────────────────────────────────────────────

function QuestionCard({
  question,
  category,
  suggestedApproach,
  practiceMode,
}: {
  question: string
  category: string
  suggestedApproach: string
  practiceMode: boolean
}) {
  const [revealed, setRevealed] = useState(false)
  const showApproach = !practiceMode || revealed
  const catColor = CATEGORY_COLORS[category] || "bg-zinc-50 text-zinc-600 border-zinc-200"
  const catLabel = CATEGORY_LABELS[category] || category

  return (
    <div className="p-2 rounded-md border border-zinc-100 hover:border-zinc-200 transition-colors">
      <div className="flex items-start gap-2">
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 mt-0.5 ${catColor}`}
        >
          {catLabel}
        </span>
        <p className="text-xs font-medium text-zinc-800 leading-relaxed">
          {question}
        </p>
      </div>
      {showApproach ? (
        <p className="text-[11px] text-zinc-500 mt-1.5 pl-[52px] leading-relaxed">
          {suggestedApproach}
        </p>
      ) : (
        <button
          onClick={() => setRevealed(true)}
          className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 mt-1.5 pl-[52px] flex items-center gap-1 transition-colors"
        >
          <Eye size={10} />
          Reveal approach
        </button>
      )}
    </div>
  )
}
