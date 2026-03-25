"use client"

import { useState, useEffect, useRef } from "react"
import { useInterviewPrep, isPrepStage } from "@/hooks/use-interview-prep"
import type { DebriefInput } from "@/hooks/use-interview-prep"
import { DebriefForm } from "@/components/applications/debrief-form"
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Copy,
  ClipboardCheck,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react"
import { toast } from "sonner"
import type { Application, InterviewPrep, PrepStageKey, StarStory, SalaryRange } from "@/types"

interface InterviewPrepSectionProps {
  application: Application
}

function formatSectionName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPrepAsMarkdown(prep: InterviewPrep, stage: PrepStageKey): string {
  const stagePrep = prep[stage]
  if (!stagePrep?.content) return ""

  const content = stagePrep.content as Record<string, unknown>
  const lines: string[] = [`# ${stage.replace("_", " ").toUpperCase()} Prep\n`]

  for (const [key, value] of Object.entries(content)) {
    const heading = formatSectionName(key)
    lines.push(`## ${heading}\n`)

    if (typeof value === "string") {
      lines.push(value + "\n")
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          lines.push(`- ${item}`)
        } else if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, string>
          if (obj.situation) {
            lines.push(`### ${obj.title || "Story"}`)
            lines.push(`- **Situation:** ${obj.situation}`)
            lines.push(`- **Task:** ${obj.task}`)
            lines.push(`- **Action:** ${obj.action}`)
            lines.push(`- **Result:** ${obj.result}`)
          } else {
            lines.push(`- ${JSON.stringify(item)}`)
          }
        }
      }
      lines.push("")
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`- **${k}:** ${v}`)
      }
      lines.push("")
    }
  }

  return lines.join("\n")
}

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString()
}

function RenderStringArray({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-zinc-400 italic">None yet</p>
  return (
    <ul className="list-disc list-inside space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-xs text-zinc-700">{item}</li>
      ))}
    </ul>
  )
}

function RenderStarStory({ story }: { story: StarStory }) {
  return (
    <div className="bg-zinc-50 rounded-lg p-3 space-y-1.5">
      <p className="text-xs font-semibold text-zinc-800">{story.title}</p>
      <p className="text-xs text-zinc-600"><span className="font-semibold text-zinc-500">S:</span> {story.situation}</p>
      <p className="text-xs text-zinc-600"><span className="font-semibold text-zinc-500">T:</span> {story.task}</p>
      <p className="text-xs text-zinc-600"><span className="font-semibold text-zinc-500">A:</span> {story.action}</p>
      <p className="text-xs text-zinc-600"><span className="font-semibold text-zinc-500">R:</span> {story.result}</p>
    </div>
  )
}

function RenderSalaryRange({ salary }: { salary: SalaryRange }) {
  return (
    <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-zinc-500">Low: <span className="font-mono text-zinc-700">{formatCurrency(salary.low)}</span></span>
        <span className="text-zinc-500">Mid: <span className="font-mono text-zinc-700">{formatCurrency(salary.mid)}</span></span>
        <span className="text-zinc-500">High: <span className="font-mono text-zinc-700">{formatCurrency(salary.high)}</span></span>
      </div>
      {salary.target && (
        <p className="text-xs text-emerald-700 font-semibold">Target: {formatCurrency(salary.target)}</p>
      )}
      <p className="text-[10px] text-zinc-400">Source: {salary.source}</p>
    </div>
  )
}

function RenderSkillChips({ skills }: { skills: string[] }) {
  if (skills.length === 0) return <p className="text-xs text-zinc-400 italic">None</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((skill, i) => (
        <span
          key={i}
          className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
        >
          {skill}
        </span>
      ))}
    </div>
  )
}

function RenderContentValue({ keyName, value }: { keyName: string; value: unknown }) {
  if (keyName === "skills_to_study" && Array.isArray(value)) {
    return <RenderSkillChips skills={value as string[]} />
  }

  if (keyName === "salary_prep" || keyName === "salary_analysis") {
    return <RenderSalaryRange salary={value as SalaryRange} />
  }

  if (keyName === "star_stories" && Array.isArray(value)) {
    if (value.length === 0) return <p className="text-xs text-zinc-400 italic">None yet</p>
    return (
      <div className="space-y-2">
        {(value as StarStory[]).map((story, i) => (
          <RenderStarStory key={i} story={story} />
        ))}
      </div>
    )
  }

  if (typeof value === "string") {
    return <p className="text-xs text-zinc-700">{value}</p>
  }

  if (Array.isArray(value)) {
    return <RenderStringArray items={value as string[]} />
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <p key={k} className="text-xs text-zinc-600">
            <span className="font-semibold text-zinc-500">{formatSectionName(k)}:</span>{" "}
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </p>
        ))}
      </div>
    )
  }

  return <p className="text-xs text-zinc-400 italic">No content</p>
}

export function InterviewPrepSection({ application }: InterviewPrepSectionProps) {
  const { prep, currentStagePrep, generating, error, generatePrep, submitDebrief } =
    useInterviewPrep(application)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [debriefOpen, setDebriefOpen] = useState(false)

  const generateRef = useRef(generatePrep)
  generateRef.current = generatePrep

  // Auto-trigger generation when entering a prep stage with no existing prep
  useEffect(() => {
    if (isPrepStage(application.status) && !prep[application.status] && !generating) {
      generateRef.current(application.status)
      toast("Generating prep materials...")
    }
  }, [application.status, prep, generating])

  if (!isPrepStage(application.status)) return null

  const stage = application.status as PrepStageKey

  async function handleRefresh() {
    await generatePrep(stage)
    toast("Prep materials refreshed")
  }

  async function handleCopy() {
    const md = formatPrepAsMarkdown(prep, stage)
    await navigator.clipboard.writeText(md)
    setCopied(true)
    toast.success("Prep copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDebrief(debrief: DebriefInput) {
    const result = await submitDebrief(debrief)
    if (result) {
      toast.success("Debrief saved. Prep for your next round will incorporate this feedback.")
      setDebriefOpen(false)
    }
    return result
  }

  const contentEntries = currentStagePrep?.content
    ? Object.entries(currentStagePrep.content as Record<string, unknown>)
    : []

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
        <Sparkles size={12} className="text-amber-500" />
        <span className="text-xs font-semibold text-zinc-500 group-hover:text-zinc-700">
          Interview Prep
        </span>
        {currentStagePrep?.content && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
            {formatSectionName(stage)}
          </span>
        )}
        <span className="flex-1" />

        {/* Action buttons — visible on hover */}
        {currentStagePrep?.content && (
          <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleRefresh()
              }}
              className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
              title="Refresh prep"
            >
              <RefreshCw size={10} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCopy()
              }}
              className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
              title="Copy as markdown"
            >
              {copied ? <ClipboardCheck size={10} /> : <Copy size={10} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDebriefOpen(true)
              }}
              className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
              title="Log debrief"
            >
              <FileText size={10} />
            </button>
          </span>
        )}
      </button>

      <DebriefForm
        open={debriefOpen}
        onOpenChange={setDebriefOpen}
        onSubmit={handleDebrief}
        nextRound={(prep.debriefs?.length || 0) + 1}
      />

      {/* Content */}
      {open && (
        <div className="mt-2 space-y-3">
          {/* Generating state */}
          {generating && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 size={14} className="text-amber-500 animate-spin" />
              <span className="text-xs text-zinc-500">Generating prep...</span>
            </div>
          )}

          {/* Error state */}
          {error && !generating && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-700 flex-1">{error}</span>
              <button
                onClick={() => generatePrep(stage)}
                className="text-[10px] font-bold text-red-700 hover:text-red-900 px-2 py-1 bg-red-100 rounded"
              >
                Retry
              </button>
            </div>
          )}

          {/* No prep — generate button */}
          {!currentStagePrep?.content && !generating && !error && (
            <button
              onClick={() => {
                generatePrep(stage)
                toast("Generating prep materials...")
              }}
              className="flex items-center gap-2 w-full justify-center py-3 rounded-lg border border-dashed border-zinc-300 text-zinc-500 hover:border-amber-300 hover:text-amber-600 transition-colors"
            >
              <Sparkles size={14} />
              <span className="text-xs font-semibold">Generate Prep</span>
            </button>
          )}

          {/* Prep content — expandable subsections */}
          {currentStagePrep?.content && !generating && (
            <div className="space-y-2">
              {contentEntries.map(([key, value]) => (
                <PrepSubsection key={key} keyName={key} value={value} />
              ))}
              {currentStagePrep.generated_at && (
                <p className="text-[10px] text-zinc-400 text-right">
                  Generated {new Date(currentStagePrep.generated_at).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PrepSubsection({ keyName, value }: { keyName: string; value: unknown }) {
  const [subOpen, setSubOpen] = useState(false)

  // Skip rendering empty arrays
  const isEmpty = Array.isArray(value) && value.length === 0

  return (
    <div className="rounded-lg border border-zinc-100">
      <button
        onClick={() => setSubOpen(!subOpen)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-zinc-50 rounded-lg transition-colors"
      >
        {subOpen ? (
          <ChevronDown size={10} className="text-zinc-400" />
        ) : (
          <ChevronRight size={10} className="text-zinc-400" />
        )}
        <span className="text-xs font-semibold text-zinc-600">
          {formatSectionName(keyName)}
        </span>
        {isEmpty && (
          <span className="text-[10px] text-zinc-400 italic">empty</span>
        )}
        {Array.isArray(value) && value.length > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
            {value.length}
          </span>
        )}
      </button>
      {subOpen && (
        <div className="px-3 pb-3">
          <RenderContentValue keyName={keyName} value={value} />
        </div>
      )}
    </div>
  )
}
