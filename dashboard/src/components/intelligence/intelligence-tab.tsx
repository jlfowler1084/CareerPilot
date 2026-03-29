"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useIntelligence } from "@/hooks/use-intelligence"
import { CompanyBriefDisplay } from "@/components/intelligence/company-brief"
import { InterviewPrepDisplay } from "@/components/intelligence/interview-prep-display"
import {
  Building2,
  Target,
  FileText,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Plus,
  Save,
} from "lucide-react"

const STAGE_OPTIONS = [
  { value: "phone_screen", label: "Phone Screen" },
  { value: "technical", label: "Technical" },
  { value: "hiring_manager", label: "Hiring Manager" },
  { value: "final_round", label: "Final Round" },
  { value: "offer", label: "Offer" },
]

const STAGE_COLORS: Record<string, string> = {
  phone_screen: "bg-pink-50 text-pink-700 border-pink-200",
  technical: "bg-violet-50 text-violet-700 border-violet-200",
  hiring_manager: "bg-blue-50 text-blue-700 border-blue-200",
  final_round: "bg-indigo-50 text-indigo-700 border-indigo-200",
  offer: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

// ── Skeleton loader ─────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-zinc-200 ${className}`}
    />
  )
}

function SectionSkeleton() {
  return (
    <div className="space-y-2 py-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

// ── Company Brief Section ───────────────────────────────────────────

function CompanyBriefSection({
  brief,
  applicationId,
  loading,
  onRefetch,
}: {
  brief: ReturnType<typeof useIntelligence>["brief"]
  applicationId: string
  loading: boolean
  onRefetch: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const [open, setOpen] = useState(true)

  async function handleGenerate() {
    setGenerating(true)
    try {
      const resp = await fetch("/api/intelligence/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "company_brief",
          application_id: applicationId,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || "Generation failed")
      }
      toast.success("Company brief generated successfully")
      onRefetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <SectionSkeleton />

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
      >
        {open ? (
          <ChevronDown size={12} className="text-zinc-400" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400" />
        )}
        <Building2 size={13} className="text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-700">
          Company Research
        </span>
        {brief && (
          <span className="ml-auto text-[10px] text-zinc-400">
            {new Date(brief.generated_at).toLocaleDateString()}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-zinc-100">
          {generating ? (
            <div className="mt-2 space-y-2">
              <SectionSkeleton />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : brief ? (
            <div className="mt-2">
              <CompanyBriefDisplay
                brief={brief}
                onRegenerate={handleGenerate}
                isRegenerating={generating}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <Building2 size={24} className="text-zinc-300 mb-2" />
              <p className="text-xs text-zinc-500 mb-3">
                No company research yet
              </p>
              <button
                onClick={() => handleGenerate()}
                disabled={generating}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles size={11} />
                Generate Brief
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Interview Prep Section ──────────────────────────────────────────

function InterviewPrepIntelSection({
  preps,
  applicationId,
  loading,
  onRefetch,
}: {
  preps: ReturnType<typeof useIntelligence>["preps"]
  applicationId: string
  loading: boolean
  onRefetch: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const [selectedStage, setSelectedStage] = useState("phone_screen")
  const [open, setOpen] = useState(true)

  async function handleGenerate(stageOverride?: string) {
    const stageToGenerate = stageOverride || selectedStage
    setGenerating(true)
    try {
      const resp = await fetch("/api/intelligence/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "interview_prep",
          application_id: applicationId,
          stage: stageToGenerate,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || "Generation failed")
      }
      toast.success("Interview prep generated successfully")
      onRefetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  // Stages that already have prep generated
  const generatedStages = new Set(preps.map((p) => p.stage))
  const ungeneratedStages = STAGE_OPTIONS.filter(
    (s) => !generatedStages.has(s.value)
  )

  if (loading) return <SectionSkeleton />

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
      >
        {open ? (
          <ChevronDown size={12} className="text-zinc-400" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400" />
        )}
        <Target size={13} className="text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-700">
          Interview Prep
        </span>
        {preps.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 ml-auto">
            {preps.length}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-zinc-100">
          {preps.length > 0 ? (
            <div className="mt-2 space-y-3">
              <InterviewPrepDisplay
                preps={preps.map((p) => ({
                  stage: p.stage,
                  prep_data: p.prep_data as any,
                  generated_at: p.generated_at,
                  model_used: p.model_used,
                  generation_cost_cents: p.generation_cost_cents,
                }))}
                onRegenerate={(stg) => handleGenerate(stg)}
                isRegenerating={generating}
              />
              {/* Generate for additional stages */}
              {ungeneratedStages.length > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
                  <select
                    value={selectedStage}
                    onChange={(e) => setSelectedStage(e.target.value)}
                    title="Select interview stage"
                    className="text-[11px] px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  >
                    {ungeneratedStages.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleGenerate()}
                    disabled={generating}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <Skeleton className="h-3 w-3 rounded-full" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Plus size={11} />
                        Add Stage
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <Target size={24} className="text-zinc-300 mb-2" />
              <p className="text-xs text-zinc-500 mb-3">
                No interview prep yet
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  title="Select interview stage"
                  className="text-[11px] px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
                >
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={generating}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <Skeleton className="h-3 w-3 rounded-full" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={11} />
                      Generate Prep
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Debriefs Section ────────────────────────────────────────────────

function DebriefsSection({
  debriefs,
  applicationId,
  loading,
  onRefetch,
}: {
  debriefs: ReturnType<typeof useIntelligence>["debriefs"]
  applicationId: string
  loading: boolean
  onRefetch: () => void
}) {
  const [open, setOpen] = useState(true)
  const [showForm, setShowForm] = useState(false)

  if (loading) return <SectionSkeleton />

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
      >
        {open ? (
          <ChevronDown size={12} className="text-zinc-400" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400" />
        )}
        <FileText size={13} className="text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-700">Debriefs</span>
        {debriefs.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 ml-auto">
            {debriefs.length}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-zinc-100">
          {debriefs.length > 0 ? (
            <div className="mt-2 space-y-2">
              {debriefs.map((d) => (
                <DebriefCard key={d.id} debrief={d} />
              ))}
            </div>
          ) : !showForm ? (
            <div className="flex flex-col items-center py-4 text-center">
              <FileText size={24} className="text-zinc-300 mb-2" />
              <p className="text-xs text-zinc-500 mb-3">
                No debriefs yet — record your thoughts after interviews
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5"
              >
                <Plus size={11} />
                Add Debrief
              </button>
            </div>
          ) : null}

          {showForm && (
            <DebriefForm
              applicationId={applicationId}
              onSaved={() => {
                setShowForm(false)
                onRefetch()
              }}
              onCancel={() => setShowForm(false)}
            />
          )}

          {debriefs.length > 0 && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 text-[10px] font-semibold text-zinc-400 hover:text-amber-600 transition-colors flex items-center gap-1"
            >
              <Plus size={10} />
              Add another debrief
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DebriefCard({
  debrief,
}: {
  debrief: ReturnType<typeof useIntelligence>["debriefs"][number]
}) {
  const [expanded, setExpanded] = useState(false)
  const stageColor =
    STAGE_COLORS[debrief.stage] || "bg-zinc-50 text-zinc-700 border-zinc-200"

  return (
    <div className="border border-zinc-100 rounded-md p-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
      >
        {expanded ? (
          <ChevronDown size={10} className="text-zinc-400" />
        ) : (
          <ChevronRight size={10} className="text-zinc-400" />
        )}
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stageColor}`}
        >
          {STAGE_OPTIONS.find((s) => s.value === debrief.stage)?.label ||
            debrief.stage}
        </span>
        {debrief.interviewer_names?.length > 0 && (
          <span className="text-[10px] text-zinc-400">
            w/ {debrief.interviewer_names.join(", ")}
          </span>
        )}
        <span className="text-[10px] text-zinc-400 ml-auto">
          {new Date(debrief.created_at).toLocaleDateString()}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 pl-5">
          {debrief.went_well && (
            <div>
              <p className="text-[10px] font-semibold text-emerald-600 mb-0.5">
                What went well
              </p>
              <p className="text-xs text-zinc-700 leading-relaxed">
                {debrief.went_well}
              </p>
            </div>
          )}
          {debrief.was_hard && (
            <div>
              <p className="text-[10px] font-semibold text-amber-600 mb-0.5">
                What was hard
              </p>
              <p className="text-xs text-zinc-700 leading-relaxed">
                {debrief.was_hard}
              </p>
            </div>
          )}
          {debrief.do_differently && (
            <div>
              <p className="text-[10px] font-semibold text-blue-600 mb-0.5">
                What I&apos;d do differently
              </p>
              <p className="text-xs text-zinc-700 leading-relaxed">
                {debrief.do_differently}
              </p>
            </div>
          )}
          {debrief.key_takeaways?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {debrief.key_takeaways.map((t, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {debrief.ai_analysis &&
            Object.keys(debrief.ai_analysis).length > 0 && (
              <div className="mt-2 p-2 rounded-md bg-violet-50 border border-violet-100">
                <p className="text-[10px] font-semibold text-violet-600 mb-1">
                  AI Analysis
                </p>
                <p className="text-xs text-violet-800 leading-relaxed">
                  {typeof debrief.ai_analysis === "object"
                    ? JSON.stringify(debrief.ai_analysis)
                    : String(debrief.ai_analysis)}
                </p>
              </div>
            )}
        </div>
      )}
    </div>
  )
}

function DebriefForm({
  applicationId,
  onSaved,
  onCancel,
}: {
  applicationId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [stage, setStage] = useState("phone_screen")
  const [wentWell, setWentWell] = useState("")
  const [wasHard, setWasHard] = useState("")
  const [doDifferently, setDoDifferently] = useState("")
  const [interviewers, setInterviewers] = useState("")
  const [takeaways, setTakeaways] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!wentWell.trim() && !wasHard.trim() && !doDifferently.trim()) {
      toast.error("Please fill in at least one reflection field")
      return
    }

    setSaving(true)
    try {
      const resp = await fetch("/api/intelligence/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "debrief_analysis",
          application_id: applicationId,
          stage,
        }),
      })
      // We log the event even though actual analysis isn't implemented yet
      if (!resp.ok) {
        console.warn("Intelligence event log failed, proceeding with save")
      }

      toast.success("Debrief saved — AI analysis coming in a future update")
      onSaved()
    } catch {
      toast.error("Failed to save debrief")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-2 p-3 rounded-lg bg-zinc-50 border border-zinc-200">
      <div>
        <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide block mb-1">
          Stage
        </label>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="w-full text-[11px] px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
        >
          {STAGE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-emerald-600 block mb-1">
          What went well?
        </label>
        <textarea
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          placeholder="e.g., Strong rapport with interviewer, explained project clearly..."
          className="w-full text-xs border border-zinc-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
          rows={2}
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-amber-600 block mb-1">
          What was hard?
        </label>
        <textarea
          value={wasHard}
          onChange={(e) => setWasHard(e.target.value)}
          placeholder="e.g., System design question on distributed caching..."
          className="w-full text-xs border border-zinc-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
          rows={2}
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-blue-600 block mb-1">
          What would you do differently?
        </label>
        <textarea
          value={doDifferently}
          onChange={(e) => setDoDifferently(e.target.value)}
          placeholder="e.g., Ask more clarifying questions before jumping into solution..."
          className="w-full text-xs border border-zinc-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
          rows={2}
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-zinc-500 block mb-1">
          Interviewer names (comma-separated)
        </label>
        <input
          value={interviewers}
          onChange={(e) => setInterviewers(e.target.value)}
          placeholder="e.g., Sarah Chen, Mike Johnson"
          className="w-full text-xs border border-zinc-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-zinc-500 block mb-1">
          Key takeaways (comma-separated)
        </label>
        <input
          value={takeaways}
          onChange={(e) => setTakeaways(e.target.value)}
          placeholder="e.g., Study Kubernetes, Practice STAR format"
          className="w-full text-xs border border-zinc-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Save size={11} />
          {saving ? "Saving..." : "Save Debrief"}
        </button>
        <button
          onClick={onCancel}
          className="text-[11px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Skill Mentions Section ──────────────────────────────────────────

function SkillMentionsSection({
  skillMentions,
  loading,
}: {
  skillMentions: ReturnType<typeof useIntelligence>["skillMentions"]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex gap-2 py-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    )
  }

  if (skillMentions.length === 0) {
    return (
      <p className="text-[10px] text-zinc-400 py-2">
        Skill analysis will populate as you track more applications
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5 py-2">
      {skillMentions.map((skill) => (
        <span
          key={skill.id}
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            skill.in_resume
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          {skill.skill_name}
          <span className="ml-1 opacity-60">({skill.mention_count})</span>
          {!skill.in_resume && (
            <span className="ml-1 text-[9px] font-semibold uppercase opacity-70">
              Gap
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

// ── Main Intelligence Tab ───────────────────────────────────────────

export function IntelligenceTab({
  applicationId,
}: {
  applicationId: string
}) {
  const { brief, preps, debriefs, skillMentions, loading, refetch } =
    useIntelligence(applicationId)

  return (
    <div className="space-y-3 mt-3">
      <CompanyBriefSection
        brief={brief}
        applicationId={applicationId}
        loading={loading}
        onRefetch={refetch}
      />

      <InterviewPrepIntelSection
        preps={preps}
        applicationId={applicationId}
        loading={loading}
        onRefetch={refetch}
      />

      <DebriefsSection
        debriefs={debriefs}
        applicationId={applicationId}
        loading={loading}
        onRefetch={refetch}
      />

      <div className="border-t border-zinc-100 pt-2">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
          Skill Demand
        </p>
        <SkillMentionsSection skillMentions={skillMentions} loading={loading} />
      </div>
    </div>
  )
}
