"use client"

import { useState, useEffect, useCallback } from "react"
import { useAutoApplySettings } from "@/hooks/use-auto-apply-settings"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"
import { Save, Plus, Trash2, X } from "lucide-react"

const supabase = createClient()

export default function SettingsPage() {
  const { settings, updateSettings, loading } = useAutoApplySettings()
  const { user, loading: authLoading } = useAuth()

  // Excluded companies tag input
  const [companyInput, setCompanyInput] = useState("")

  // Screening answers
  const [answers, setAnswers] = useState<Array<{
    id: string; question_pattern: string; answer_value: string;
    answer_type: string | null; category: string | null; priority: number | null
  }>>([])
  const [answersLoading, setAnswersLoading] = useState(true)

  // Skills inventory
  const [skills, setSkills] = useState<Array<{
    id: string; skill_name: string; category: string;
    weight: number | null; years_experience: number | null; aliases: string[] | null
  }>>([])
  const [skillsLoading, setSkillsLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user) return

    const load = async () => {
      const { data: a } = await supabase
        .from("screening_answers")
        .select("*")
        .eq("user_id", user.id)
        .order("priority", { ascending: false })
      setAnswers(a || [])
      setAnswersLoading(false)

      const { data: s } = await supabase
        .from("skills_inventory")
        .select("*")
        .eq("user_id", user.id)
        .order("weight", { ascending: false })
      setSkills(s || [])
      setSkillsLoading(false)
    }
    load()
  }, [user, authLoading])

  const addExcludedCompany = useCallback(() => {
    if (!companyInput.trim() || !settings) return
    const updated = [...(settings.excluded_companies || []), companyInput.trim()]
    updateSettings({ excluded_companies: updated })
    setCompanyInput("")
    toast.success(`Excluded: ${companyInput.trim()}`)
  }, [companyInput, settings, updateSettings])

  const removeExcludedCompany = useCallback((company: string) => {
    if (!settings) return
    const updated = (settings.excluded_companies || []).filter((c) => c !== company)
    updateSettings({ excluded_companies: updated })
  }, [settings, updateSettings])

  const deleteAnswer = useCallback(async (id: string) => {
    await supabase.from("screening_answers").delete().eq("id", id)
    setAnswers((prev) => prev.filter((a) => a.id !== id))
    toast.success("Answer deleted")
  }, [])

  const deleteSkill = useCallback(async (id: string) => {
    await supabase.from("skills_inventory").delete().eq("id", id)
    setSkills((prev) => prev.filter((s) => s.id !== id))
    toast.success("Skill deleted")
  }, [])

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-lg font-bold">Settings</h2>
        <div className="h-96 bg-zinc-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!settings) return null

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h2 className="text-lg font-bold">Settings</h2>

      {/* Auto-Apply Configuration */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-800">Auto-Apply Configuration</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-zinc-500">Enabled</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => updateSettings({ enabled: e.target.checked })}
              className="rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
            />
          </label>
        </div>

        {/* Thresholds */}
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Thresholds</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-600 block mb-1">
                Auto-approve score: {settings.auto_approve_threshold}
              </label>
              <input
                type="range"
                min={50} max={100}
                value={settings.auto_approve_threshold}
                onChange={(e) => updateSettings({ auto_approve_threshold: parseInt(e.target.value) })}
                className="w-full accent-amber-500"
              />
              <p className="text-[10px] text-zinc-400 mt-0.5">Jobs above this score auto-enter the queue</p>
            </div>
            <div>
              <label className="text-xs text-zinc-600 block mb-1">
                Review score: {settings.manual_review_threshold}
              </label>
              <input
                type="range"
                min={30} max={100}
                value={settings.manual_review_threshold}
                onChange={(e) => updateSettings({ manual_review_threshold: parseInt(e.target.value) })}
                className="w-full accent-amber-500"
              />
              <p className="text-[10px] text-zinc-400 mt-0.5">Jobs scoring {settings.manual_review_threshold}-{settings.auto_approve_threshold - 1} need manual approval</p>
            </div>
          </div>
        </div>

        {/* Limits */}
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Limits</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-600 block mb-1">Max daily applications</label>
              <input
                type="number"
                min={1} max={50}
                value={settings.max_daily_applications}
                onChange={(e) => updateSettings({ max_daily_applications: parseInt(e.target.value) || 10 })}
                className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-md focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600 block mb-1">Max batch size</label>
              <input
                type="number"
                min={1} max={20}
                value={settings.max_batch_size}
                onChange={(e) => updateSettings({ max_batch_size: parseInt(e.target.value) || 5 })}
                className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-md focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Preferences</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.easy_apply_only}
                onChange={(e) => updateSettings({ easy_apply_only: e.target.checked })}
                className="rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
              />
              <span className="text-xs text-zinc-600">Easy Apply only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.require_cover_letter}
                onChange={(e) => updateSettings({ require_cover_letter: e.target.checked })}
                className="rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
              />
              <span className="text-xs text-zinc-600">Require cover letter</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.auto_generate_materials}
                onChange={(e) => updateSettings({ auto_generate_materials: e.target.checked })}
                className="rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
              />
              <span className="text-xs text-zinc-600">Auto-generate materials</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-600">Sources:</span>
            {["indeed", "dice"].map((source) => (
              <label key={source} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(settings.preferred_sources || []).includes(source)}
                  onChange={(e) => {
                    const current = settings.preferred_sources || []
                    const updated = e.target.checked
                      ? [...current, source]
                      : current.filter((s) => s !== source)
                    updateSettings({ preferred_sources: updated })
                  }}
                  className="rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
                />
                <span className="text-xs text-zinc-600 capitalize">{source}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="text-xs text-zinc-600 block mb-1">Minimum salary ($)</label>
            <input
              type="number"
              min={0} step={5000}
              value={settings.min_salary}
              onChange={(e) => updateSettings({ min_salary: parseInt(e.target.value) || 0 })}
              className="w-48 px-3 py-1.5 text-sm border border-zinc-200 rounded-md focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
            />
          </div>
        </div>

        {/* Excluded Companies */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Excluded Companies</h4>
          <div className="flex flex-wrap gap-2">
            {(settings.excluded_companies || []).map((company) => (
              <span
                key={company}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[11px] font-medium border border-red-200"
              >
                {company}
                <button
                  type="button"
                  onClick={() => removeExcludedCompany(company)}
                  className="hover:text-red-900 transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addExcludedCompany()}
              placeholder="Type company name and press Enter"
              className="flex-1 px-3 py-1.5 text-sm border border-zinc-200 rounded-md focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
            />
            <button
              type="button"
              onClick={addExcludedCompany}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
            >
              Exclude
            </button>
          </div>
        </div>
      </div>

      {/* Scheduled Apply */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <h3 className="text-sm font-bold text-zinc-800">Scheduled Auto-Apply</h3>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.scheduled_apply_enabled ?? false}
              onChange={(e) => updateSettings({ scheduled_apply_enabled: e.target.checked })}
              className="rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
            />
            <span className="text-xs text-zinc-600">Enable scheduled apply</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Check every:</span>
            <select
              value={settings.scheduled_apply_interval ?? 30}
              onChange={(e) => updateSettings({ scheduled_apply_interval: parseInt(e.target.value) })}
              disabled={!settings.scheduled_apply_enabled}
              title="Check interval"
              className="text-xs px-2 py-1 border border-zinc-200 rounded-md focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
        </div>
        <p className="text-[10px] text-zinc-400">
          When enabled, the dashboard will check for approved queue items with materials ready and prompt to start an apply session.
        </p>
      </div>

      {/* Screening Answers */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <h3 className="text-sm font-bold text-zinc-800">Screening Answers</h3>
        {answersLoading ? (
          <div className="h-24 bg-zinc-100 rounded-lg animate-pulse" />
        ) : answers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Pattern</th>
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Answer</th>
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Type</th>
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Category</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {answers.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-2 px-2 font-mono text-zinc-700 max-w-[200px] truncate">{a.question_pattern}</td>
                    <td className="py-2 px-2 text-zinc-600 max-w-[200px] truncate">{a.answer_value}</td>
                    <td className="py-2 px-2 text-zinc-500">{a.answer_type}</td>
                    <td className="py-2 px-2 text-zinc-500">{a.category}</td>
                    <td className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() => deleteAnswer(a.id)}
                        className="text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-400">No screening answers configured.</p>
        )}
        <p className="text-[10px] text-zinc-400">{answers.length} answer{answers.length !== 1 ? "s" : ""} configured</p>
      </div>

      {/* Skills Inventory */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <h3 className="text-sm font-bold text-zinc-800">Skills Inventory</h3>
        {skillsLoading ? (
          <div className="h-24 bg-zinc-100 rounded-lg animate-pulse" />
        ) : skills.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Skill</th>
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Category</th>
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Weight</th>
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Years</th>
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">Aliases</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-2 px-2 font-medium text-zinc-700">{s.skill_name}</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        s.category === "core" ? "bg-emerald-50 text-emerald-700" :
                        s.category === "strong" ? "bg-blue-50 text-blue-700" :
                        s.category === "growing" ? "bg-amber-50 text-amber-700" :
                        "bg-zinc-100 text-zinc-600"
                      }`}>
                        {s.category}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-mono text-zinc-600">{(s.weight ?? 0).toFixed(1)}</td>
                    <td className="py-2 px-2 text-zinc-600">{s.years_experience ?? "—"}</td>
                    <td className="py-2 px-2 text-zinc-500 max-w-[150px] truncate">{(s.aliases || []).join(", ") || "—"}</td>
                    <td className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() => deleteSkill(s.id)}
                        className="text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-400">No skills in inventory.</p>
        )}
        <p className="text-[10px] text-zinc-400">{skills.length} skill{skills.length !== 1 ? "s" : ""} in inventory</p>
      </div>
    </div>
  )
}
