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
import { toast } from "sonner"
import {
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  FileText,
  Zap,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react"
import type { Job } from "@/types"

type ApplyFlowView = "checklist" | "confirm"

interface ApplyFlowProps {
  job: Job
  isOpen: boolean
  onClose: () => void
  onApplied: (job: Job) => void
  /** Pre-generated tailored resume text (from in-memory ref or saved application) */
  tailoredResume: string | null
  /** Pre-generated cover letter text (from in-memory ref or saved application) */
  coverLetter: string | null
  /** Callback to open the tailor modal for this job */
  onTailor?: (job: Job) => void
  /** Callback to open the cover letter modal for this job */
  onCoverLetter?: (job: Job) => void
}

export function ApplyFlow({
  job,
  isOpen,
  onClose,
  onApplied,
  tailoredResume,
  coverLetter,
  onTailor,
  onCoverLetter,
}: ApplyFlowProps) {
  const [view, setView] = useState<ApplyFlowView>("checklist")
  const [resumeCopied, setResumeCopied] = useState(false)
  const [letterCopied, setLetterCopied] = useState(false)

  const hasResume = !!tailoredResume
  const hasCoverLetter = !!coverLetter

  const applyUrl = job.url

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset state on close
      setView("checklist")
      setResumeCopied(false)
      setLetterCopied(false)
      onClose()
    }
  }

  async function handleCopyResume() {
    if (!tailoredResume) return
    try {
      await navigator.clipboard.writeText(tailoredResume)
      setResumeCopied(true)
      toast.success("Resume copied to clipboard")
      setTimeout(() => setResumeCopied(false), 2000)
    } catch {
      toast.error("Failed to copy — try manually selecting the text")
    }
  }

  async function handleCopyCoverLetter() {
    if (!coverLetter) return
    try {
      await navigator.clipboard.writeText(coverLetter)
      setLetterCopied(true)
      toast.success("Cover letter copied to clipboard")
      setTimeout(() => setLetterCopied(false), 2000)
    } catch {
      toast.error("Failed to copy — try manually selecting the text")
    }
  }

  function handleOpenApplication() {
    if (applyUrl) {
      window.open(applyUrl, "_blank", "noopener,noreferrer")
    }
    setView("confirm")
  }

  function handleConfirmApplied() {
    onApplied(job)
    toast.success(`Applied to ${job.title} at ${job.company}`)
    handleOpenChange(false)
  }

  function handleNotYet() {
    setView("checklist")
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {view === "checklist" ? (
          <>
            <DialogHeader>
              <DialogTitle>Apply to {job.title}</DialogTitle>
              <DialogDescription>at {job.company}</DialogDescription>
            </DialogHeader>

            {/* Pre-Apply Checklist */}
            <div className="space-y-4 py-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Pre-Apply Checklist
              </p>

              {/* Resume check */}
              <div className="flex items-start gap-3">
                {hasResume ? (
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-zinc-300 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-700">
                    Resume tailored for this role
                  </p>
                  <div className="flex gap-2 mt-1.5">
                    {hasResume ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyResume}
                        className="text-xs h-7"
                      >
                        {resumeCopied ? (
                          <Check className="size-3 mr-1" />
                        ) : (
                          <Copy className="size-3 mr-1" />
                        )}
                        {resumeCopied ? "Copied" : "Copy Resume"}
                      </Button>
                    ) : onTailor ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onClose()
                          onTailor(job)
                        }}
                        className="text-xs h-7"
                      >
                        <Sparkles className="size-3 mr-1" />
                        Tailor Resume
                      </Button>
                    ) : (
                      <span className="text-[10px] text-zinc-400 italic mt-1">
                        Coming soon
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cover letter check */}
              <div className="flex items-start gap-3">
                {hasCoverLetter ? (
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-zinc-300 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-700">
                    Cover letter generated
                  </p>
                  <div className="flex gap-2 mt-1.5">
                    {hasCoverLetter ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyCoverLetter}
                        className="text-xs h-7"
                      >
                        {letterCopied ? (
                          <Check className="size-3 mr-1" />
                        ) : (
                          <Copy className="size-3 mr-1" />
                        )}
                        {letterCopied ? "Copied" : "Copy Cover Letter"}
                      </Button>
                    ) : onCoverLetter ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onClose()
                          onCoverLetter(job)
                        }}
                        className="text-xs h-7"
                      >
                        <FileText className="size-3 mr-1" />
                        Generate Cover Letter
                      </Button>
                    ) : (
                      <span className="text-[10px] text-zinc-400 italic mt-1">
                        Coming soon
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Source + Easy Apply badge */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
                <span className="text-xs text-zinc-500">
                  Source: {job.source}
                </span>
                {job.easyApply && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                    <Zap size={10} />
                    Easy Apply available
                  </span>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleOpenApplication} disabled={!applyUrl}>
                <ExternalLink className="size-3.5 mr-1.5" />
                Open Application
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Confirmation view */
          <>
            <DialogHeader>
              <DialogTitle>Did you complete the application?</DialogTitle>
              <DialogDescription>
                {job.title} at {job.company}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div className="flex gap-2">
                <Button onClick={handleConfirmApplied} className="flex-1">
                  <Check className="size-3.5 mr-1.5" />
                  Yes, I applied
                </Button>
                <Button
                  variant="outline"
                  onClick={handleNotYet}
                  className="flex-1"
                >
                  Not yet
                </Button>
              </div>
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="w-full text-zinc-500"
              >
                <X className="size-3.5 mr-1.5" />
                Cancel — didn&apos;t apply
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
