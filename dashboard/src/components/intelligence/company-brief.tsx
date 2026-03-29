"use client"

import { useState } from "react"
import { RESUME_SKILLS_LIST } from "@/lib/intelligence/resume-context"
import type { CompanyBriefData } from "@/lib/intelligence/generators/company-brief"
import {
  Building2,
  Users,
  Star,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Newspaper,
  HelpCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

interface CompanyBriefDisplayProps {
  brief: {
    company_name: string
    brief_data: Record<string, unknown>
    generated_at: string
    model_used: string
    generation_cost_cents: number
  }
  onRegenerate: () => void
  isRegenerating: boolean
}

// Strip <cite> tags from web search responses
function stripCitations(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, "").trim()
}

// Normalize skill names for comparison (lowercase, strip whitespace)
const normalizedResumeSkills = new Set(
  RESUME_SKILLS_LIST.map((s) => s.toLowerCase().trim())
)

function isResumeSkill(skill: string): boolean {
  return normalizedResumeSkills.has(skill.toLowerCase().trim())
}

function formatCost(cents: number): string {
  if (cents < 1) return "<$0.01"
  return `$${(cents / 100).toFixed(3)}`
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

export function CompanyBriefDisplay({
  brief,
  onRegenerate,
  isRegenerating,
}: CompanyBriefDisplayProps) {
  const data = brief.brief_data as unknown as CompanyBriefData
  const [newsOpen, setNewsOpen] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(true)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-zinc-900">
            {brief.company_name}
          </h3>
          <p className="text-[10px] text-zinc-400">
            Generated {formatRelativeTime(brief.generated_at)}
          </p>
        </div>
        <button
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="text-[10px] font-semibold px-2 py-1 rounded-md text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors flex items-center gap-1 disabled:opacity-50"
          title="Regenerate company brief"
        >
          <RefreshCw
            size={10}
            className={isRegenerating ? "animate-spin" : ""}
          />
          {isRegenerating ? "Regenerating..." : "Refresh"}
        </button>
      </div>

      {/* Overview — hero section */}
      <p className="text-xs text-zinc-700 leading-relaxed">{stripCitations(data.overview)}</p>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Culture */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Users size={11} className="text-zinc-400" />
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
              Culture
            </span>
          </div>
          <p className="text-xs text-zinc-700 leading-relaxed">
            {stripCitations(data.culture)}
          </p>
        </div>

        {/* Glassdoor */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Star size={11} className="text-zinc-400" />
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
              Glassdoor
            </span>
          </div>
          <p className="text-xs text-zinc-700 leading-relaxed">
            {stripCitations(data.glassdoor_summary)}
          </p>
        </div>

        {/* Headcount */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Users size={11} className="text-zinc-400" />
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
              Headcount
            </span>
          </div>
          <p className="text-xs text-zinc-700">{stripCitations(data.headcount)}</p>
        </div>

        {/* Funding */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={11} className="text-zinc-400" />
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
              Funding / Stage
            </span>
          </div>
          <p className="text-xs text-zinc-700">{stripCitations(data.funding_stage)}</p>
        </div>
      </div>

      {/* Tech Stack */}
      {data.tech_stack.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
            Tech Stack
          </span>
          <div className="flex flex-wrap gap-1.5">
            {data.tech_stack.map((tech, i) => {
              const match = isResumeSkill(tech)
              return (
                <span
                  key={i}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    match
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-zinc-50 text-zinc-600 border-zinc-200"
                  }`}
                >
                  {tech}
                  {match && (
                    <span className="ml-1 text-[9px] opacity-70">
                      ✓
                    </span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Why Good Fit — highlighted callout */}
      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
        <div className="flex items-center gap-1.5 mb-1.5">
          <CheckCircle size={12} className="text-emerald-600" />
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
            Why You&apos;re a Good Fit
          </span>
        </div>
        <p className="text-xs text-emerald-800 leading-relaxed">
          {stripCitations(data.why_good_fit)}
        </p>
      </div>

      {/* Red Flags */}
      {data.red_flags &&
      stripCitations(data.red_flags).toLowerCase() !== "none identified" ? (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={12} className="text-amber-600" />
            <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
              Red Flags
            </span>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            {stripCitations(data.red_flags)}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
          <CheckCircle size={10} />
          <span>No concerns identified</span>
        </div>
      )}

      {/* Recent News — collapsible, default collapsed */}
      {data.recent_news.length > 0 && (
        <div>
          <button
            onClick={() => setNewsOpen(!newsOpen)}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide hover:text-zinc-700 transition-colors"
          >
            {newsOpen ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
            <Newspaper size={10} />
            Recent News ({data.recent_news.length})
          </button>
          {newsOpen && (
            <ul className="mt-1.5 space-y-1 pl-5 list-disc list-outside">
              {data.recent_news.map((item, i) => (
                <li key={i} className="text-xs text-zinc-700 leading-relaxed">
                  {stripCitations(item)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Questions to Research — collapsible, default expanded */}
      {data.questions_to_research.length > 0 && (
        <div>
          <button
            onClick={() => setQuestionsOpen(!questionsOpen)}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide hover:text-zinc-700 transition-colors"
          >
            {questionsOpen ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
            <HelpCircle size={10} />
            Questions to Research ({data.questions_to_research.length})
          </button>
          {questionsOpen && (
            <ol className="mt-1.5 space-y-1 pl-5 list-decimal list-outside">
              {data.questions_to_research.map((q, i) => (
                <li key={i} className="text-xs text-zinc-700 leading-relaxed">
                  {stripCitations(q)}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Footer metadata */}
      <p className="text-[9px] text-zinc-400 pt-1 border-t border-zinc-100">
        Generated by {brief.model_used} ·{" "}
        ~{formatCost(brief.generation_cost_cents)}
      </p>
    </div>
  )
}
