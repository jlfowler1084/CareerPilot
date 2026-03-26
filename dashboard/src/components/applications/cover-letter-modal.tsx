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
import { Loader2, Copy, Check, FileText } from "lucide-react"
import type { Application } from "@/types"

interface CoverLetterModalProps {
  application: Pick<Application, "title" | "company" | "url">
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CoverLetterModal({
  application,
  open,
  onOpenChange,
}: CoverLetterModalProps) {
  const [loading, setLoading] = useState(false)
  const [coverLetter, setCoverLetter] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    setError("")
    setCoverLetter("")

    try {
      const resp = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: application.title,
          company: application.company,
          url: application.url,
        }),
      })

      if (!resp.ok) {
        const data = await resp.json()
        setError(data.error || "Failed to generate cover letter")
        return
      }

      const data = await resp.json()
      setCoverLetter(data.coverLetter)
    } catch {
      setError("Network error — please try again")
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(coverLetter)
    setCopied(true)
    toast.success("Copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setCoverLetter("")
      setError("")
      setCopied(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Cover Letter</DialogTitle>
          <DialogDescription>
            {application.title} at {application.company}
          </DialogDescription>
        </DialogHeader>

        {!coverLetter && !loading && !error && (
          <div className="py-4 text-center">
            <p className="text-sm text-zinc-500 mb-4">
              This will use AI to generate a tailored cover letter for this position
              {application.url ? " using the job posting URL" : ""}.
            </p>
            <Button onClick={handleGenerate}>
              <FileText className="size-3.5 mr-1.5" />
              Generate Cover Letter
            </Button>
          </div>
        )}

        {loading && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin text-amber-600" />
            <p className="text-sm text-zinc-500">
              Writing cover letter for {application.company}...
            </p>
          </div>
        )}

        {error && (
          <div className="py-4">
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
              {error}
            </p>
            <div className="mt-3 text-center">
              <Button variant="outline" onClick={handleGenerate}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {coverLetter && (
          <div className="space-y-4">
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 max-h-96 overflow-y-auto">
              <pre className="text-xs text-zinc-800 whitespace-pre-wrap font-mono leading-relaxed">
                {coverLetter}
              </pre>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="size-3.5 mr-1.5" />
                ) : (
                  <Copy className="size-3.5 mr-1.5" />
                )}
                {copied ? "Copied" : "Copy to Clipboard"}
              </Button>
              <Button variant="outline" onClick={handleGenerate}>
                Regenerate
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
