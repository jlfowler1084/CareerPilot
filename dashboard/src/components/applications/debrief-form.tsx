"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import type { DebriefInput } from "@/hooks/use-interview-prep"

interface DebriefFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (debrief: DebriefInput) => Promise<unknown>
  nextRound: number
}

export function DebriefForm({ open, onOpenChange, onSubmit, nextRound }: DebriefFormProps) {
  const [saving, setSaving] = useState(false)
  const [rating, setRating] = useState(0)
  const [questionsAsked, setQuestionsAsked] = useState("")
  const [wentWell, setWentWell] = useState("")
  const [challenging, setChallenging] = useState("")
  const [takeaways, setTakeaways] = useState("")
  const [interviewerName, setInterviewerName] = useState("")
  const [interviewerRole, setInterviewerRole] = useState("")

  function reset() {
    setRating(0)
    setQuestionsAsked("")
    setWentWell("")
    setChallenging("")
    setTakeaways("")
    setInterviewerName("")
    setInterviewerRole("")
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleSubmit() {
    if (rating < 1 || rating > 5) return
    setSaving(true)
    const result = await onSubmit({
      round: nextRound,
      rating,
      questions_asked: questionsAsked || undefined,
      went_well: wentWell || undefined,
      challenging: challenging || undefined,
      takeaways: takeaways || undefined,
      interviewer_name: interviewerName || undefined,
      interviewer_role: interviewerRole || undefined,
    })
    setSaving(false)
    if (result) {
      reset()
      onOpenChange(false)
    }
  }

  const inputClass =
    "w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"

  const canSubmit = rating >= 1 && rating <= 5

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Interview Debrief</DialogTitle>
          <DialogDescription>
            Round {nextRound} — capture what happened while it&apos;s fresh
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Round (read-only) */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">
              Round
            </label>
            <p className="text-sm font-mono text-zinc-700 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg">
              Round {nextRound}
            </p>
          </div>

          {/* Rating */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">
              How did it go? <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className={`text-xl transition-opacity ${
                    rating >= n ? "opacity-100" : "opacity-30"
                  } hover:opacity-80`}
                >
                  {"\u2B50"}
                </button>
              ))}
              {rating > 0 && (
                <span className="text-xs text-zinc-400 self-center ml-2">
                  {rating}/5
                </span>
              )}
            </div>
            {rating === 0 && (
              <p className="text-[10px] text-red-400 mt-1">Rating is required</p>
            )}
          </div>

          {/* Interviewer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">
                Interviewer Name
              </label>
              <input
                type="text"
                value={interviewerName}
                onChange={(e) => setInterviewerName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">
                Interviewer Role
              </label>
              <input
                type="text"
                value={interviewerRole}
                onChange={(e) => setInterviewerRole(e.target.value)}
                placeholder="e.g. Engineering Manager"
                className={inputClass}
              />
            </div>
          </div>

          {/* Questions Asked */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">
              Questions Asked
            </label>
            <textarea
              value={questionsAsked}
              onChange={(e) => setQuestionsAsked(e.target.value)}
              placeholder="What did they ask you?"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Went Well */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">
              What Went Well
            </label>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              placeholder="Strengths, good moments, positive signals..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Challenging */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">
              What Was Challenging
            </label>
            <textarea
              value={challenging}
              onChange={(e) => setChallenging(e.target.value)}
              placeholder="Tough questions, areas of uncertainty..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Takeaways */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">
              Takeaways & Next Steps
            </label>
            <textarea
              value={takeaways}
              onChange={(e) => setTakeaways(e.target.value)}
              placeholder="What would you do differently? What to study before next round?"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            Save Debrief
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
