"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { TagInput } from "@/components/ui/tag-input"
import { StarRating } from "@/components/ui/star-rating"
import type { ApplicationStatus } from "@/types"

interface DebriefFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationStatus: ApplicationStatus
  saving: boolean
  onSave: (data: DebriefFormData) => void
}

export interface DebriefFormData {
  stage: string
  went_well: string
  was_hard: string
  do_differently: string
  key_takeaways: string[]
  interviewer_names: string[]
  topics_covered: string[]
  overall_rating: number
}

const STAGE_OPTIONS = [
  { value: "phone_screen", label: "Phone Screen" },
  { value: "technical", label: "Technical" },
  { value: "hiring_manager", label: "Hiring Manager" },
  { value: "final_round", label: "Final Round" },
  { value: "offer", label: "Offer" },
]

function inferStage(status: ApplicationStatus): string {
  if (status === "phone_screen") return "phone_screen"
  if (status === "interview") return "technical"
  if (status === "offer") return "offer"
  return "phone_screen"
}

export function DebriefFormModal({
  open,
  onOpenChange,
  applicationStatus,
  saving,
  onSave,
}: DebriefFormModalProps) {
  const [stage, setStage] = useState(inferStage(applicationStatus))
  const [wentWell, setWentWell] = useState("")
  const [wasHard, setWasHard] = useState("")
  const [doDifferently, setDoDifferently] = useState("")
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([])
  const [interviewerNames, setInterviewerNames] = useState<string[]>([])
  const [topicsCovered, setTopicsCovered] = useState<string[]>([])
  const [overallRating, setOverallRating] = useState(0)

  const canSave = wentWell.trim() || wasHard.trim() || doDifferently.trim()

  function handleSave() {
    onSave({
      stage,
      went_well: wentWell,
      was_hard: wasHard,
      do_differently: doDifferently,
      key_takeaways: keyTakeaways,
      interviewer_names: interviewerNames,
      topics_covered: topicsCovered,
      overall_rating: overallRating,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Post-Interview Debrief</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stage */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Interview Stage *
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-300"
            >
              {STAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* What went well */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              What went well *
            </label>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              placeholder="What aspects of the interview went well?"
              className="w-full h-20 text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-300 text-zinc-700"
            />
          </div>

          {/* What was hard */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              What was hard *
            </label>
            <textarea
              value={wasHard}
              onChange={(e) => setWasHard(e.target.value)}
              placeholder="What questions or topics were challenging?"
              className="w-full h-20 text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-300 text-zinc-700"
            />
          </div>

          {/* What I'd do differently */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              What I&apos;d do differently *
            </label>
            <textarea
              value={doDifferently}
              onChange={(e) => setDoDifferently(e.target.value)}
              placeholder="What would you change about your approach?"
              className="w-full h-20 text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-300 text-zinc-700"
            />
          </div>

          {/* Overall Rating */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Overall Rating
            </label>
            <StarRating value={overallRating} onChange={setOverallRating} />
          </div>

          {/* Key Takeaways */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Key Takeaways
            </label>
            <TagInput
              value={keyTakeaways}
              onChange={setKeyTakeaways}
              placeholder="Type a takeaway and press Enter"
            />
          </div>

          {/* Interviewer Names */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Interviewer Names
            </label>
            <TagInput
              value={interviewerNames}
              onChange={setInterviewerNames}
              placeholder="Type a name and press Enter"
            />
          </div>

          {/* Topics Covered */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Topics Covered
            </label>
            <TagInput
              value={topicsCovered}
              onChange={setTopicsCovered}
              placeholder="Type a topic and press Enter"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Saving...
              </>
            ) : (
              "Save Debrief"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
