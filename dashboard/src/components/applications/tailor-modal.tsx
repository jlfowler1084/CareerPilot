"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Copy, Check, Save, RefreshCw } from "lucide-react"
import type { Application } from "@/types"

interface TailorModalProps {
  application: Pick<Application, "title" | "company" | "url" | "tailored_resume">
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (tailoredResume: string) => Promise<void>
  /** Start in view mode showing savedResume (if available) */
  viewMode?: boolean
}

export function TailorModal({
  application,
  open,
  onOpenChange,
  onSave,
  viewMode = false,
}: TailorModalProps) {
  const [loading, setLoading] = useState(false)
  const [tailoredResume, setTailoredResume] = useState("")
  const [fitSummary, setFitSummary] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState(false)

  // When opening in view mode with a saved resume, display it
  useEffect(() => {
    if (open && viewMode && application.tailored_resume) {
      setTailoredResume(application.tailored_resume)
      setViewing(true)
    }
  }, [open, viewMode, application.tailored_resume])

  async function handleTailor() {
    setLoading(true)
    setError("")
    setTailoredResume("")
    setFitSummary("")
    setViewing(false)

    try {
      const resp = await fetch("/api/tailor-resume", {
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
        setError(data.error || "Failed to tailor resume")
        return
      }

      const data = await resp.json()
      setTailoredResume(data.tailoredResume)
      setFitSummary(data.fitSummary)
    } catch {
      setError("Network error — please try again")
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(tailoredResume)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(tailoredResume)
      onOpenChange(false)
    } catch {
      setError("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setTailoredResume("")
      setFitSummary("")
      setError("")
      setCopied(false)
      setViewing(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {viewing ? "Saved Tailored Resume" : "Tailor Resume"}
          </DialogTitle>
          <DialogDescription>
            {application.title} at {application.company}
          </DialogDescription>
        </DialogHeader>

        {!tailoredResume && !loading && !error && (
          <div className="py-4 text-center">
            <p className="text-sm text-zinc-500 mb-4">
              This will use AI to tailor your resume for this position
              {application.url ? " using the job posting URL" : ""}.
            </p>
            <Button onClick={handleTailor}>Generate Tailored Resume</Button>
          </div>
        )}

        {loading && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin text-amber-600" />
            <p className="text-sm text-zinc-500">
              Tailoring your resume for {application.company}...
            </p>
          </div>
        )}

        {error && (
          <div className="py-4">
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
              {error}
            </p>
            <div className="mt-3 text-center">
              <Button variant="outline" onClick={handleTailor}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {tailoredResume && (
          <div className="space-y-4">
            {fitSummary && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">
                  Fit Summary
                </p>
                <p className="text-sm text-amber-900">{fitSummary}</p>
              </div>
            )}

            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 max-h-96 overflow-y-auto">
              <pre className="text-xs text-zinc-800 whitespace-pre-wrap font-mono leading-relaxed">
                {tailoredResume}
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
              {viewing ? (
                <Button variant="outline" onClick={handleTailor}>
                  <RefreshCw className="size-3.5 mr-1.5" />
                  Re-tailor
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5 mr-1.5" />
                  )}
                  Save to Application
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
