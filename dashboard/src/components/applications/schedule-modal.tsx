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
import { Loader2, Check, CalendarCheck } from "lucide-react"
import type { Application, ApplicationStatus } from "@/types"

interface ScheduleModalProps {
  application: Application
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (updates: Partial<Application>) => Promise<void>
}

type CalendarAction = "follow_up" | "phone_screen" | "interview" | "offer_deadline"

const STATUS_TO_ACTION: Partial<Record<ApplicationStatus, CalendarAction>> = {
  applied: "follow_up",
  phone_screen: "phone_screen",
  interview: "interview",
  offer: "offer_deadline",
}

const ACTION_LABELS: Record<CalendarAction, string> = {
  follow_up: "Create Follow-up Reminder",
  phone_screen: "Schedule Phone Screen",
  interview: "Schedule Interview",
  offer_deadline: "Set Offer Deadline",
}

const TIME_OPTIONS: string[] = []
for (let h = 7; h <= 19; h++) {
  for (const m of ["00", "30"]) {
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
    const ampm = h >= 12 ? "PM" : "AM"
    TIME_OPTIONS.push(`${hour}:${m} ${ampm}`)
  }
}

function toISO(dateStr: string, timeStr: string): string {
  // Parse "3:30 PM" format to 24h for ISO
  const [timePart, ampm] = timeStr.split(" ")
  const [hStr, mStr] = timePart.split(":")
  let h = parseInt(hStr)
  if (ampm === "PM" && h !== 12) h += 12
  if (ampm === "AM" && h === 12) h = 0
  return `${dateStr}T${String(h).padStart(2, "0")}:${mStr}:00`
}

export function ScheduleModal({
  application,
  open,
  onOpenChange,
  onSave,
}: ScheduleModalProps) {
  const action = STATUS_TO_ACTION[application.status]
  const needsDateTime = action !== "follow_up"

  const [date, setDate] = useState("")
  const [time, setTime] = useState("9:00 AM")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [details, setDetails] = useState("")
  const [error, setError] = useState("")

  async function handleSchedule() {
    if (!action) return
    if (needsDateTime && !date) {
      setError("Please select a date")
      return
    }

    setLoading(true)
    setError("")
    setSuccess(false)

    try {
      const body: Record<string, string> = {
        action,
        title: application.title,
        company: application.company,
      }

      if (needsDateTime && date) {
        body.dateTime = toISO(date, time)
      }

      if (application.notes) {
        body.notes = application.notes
      }

      const resp = await fetch("/api/calendar-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await resp.json()

      if (!resp.ok || !data.success) {
        setError(data.error || "Failed to create calendar event")
        return
      }

      setSuccess(true)
      setDetails(data.details || "Events created successfully")
      toast.success("Calendar event created")

      // Save calendar info back to the application
      const updates: Partial<Application> = {
        calendar_event_id: data.eventId || "synced",
      }
      if (action === "follow_up") {
        const followUp = new Date()
        let added = 0
        while (added < 5) {
          followUp.setDate(followUp.getDate() + 1)
          if (followUp.getDay() !== 0 && followUp.getDay() !== 6) added++
        }
        updates.follow_up_date = followUp.toISOString()
      } else if (action === "phone_screen" || action === "interview") {
        updates.interview_date = toISO(date, time)
      }

      await onSave(updates)
    } catch {
      setError("Network error — please try again")
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setDate("")
      setTime("9:00 AM")
      setSuccess(false)
      setDetails("")
      setError("")
    }
    onOpenChange(next)
  }

  if (!action) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Calendar Event</DialogTitle>
          <DialogDescription>
            {application.title} at {application.company}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg p-3">
              <CalendarCheck className="size-5" />
              <span className="text-sm font-medium">Events created</span>
            </div>
            {details && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                <pre className="text-xs text-zinc-700 whitespace-pre-wrap">
                  {details}
                </pre>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {action === "follow_up" && (
              <p className="text-sm text-zinc-600">
                This will create a follow-up reminder 5 business days from today
                on your Google Calendar.
              </p>
            )}

            {needsDateTime && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">
                    Time (America/Indiana/Indianapolis)
                  </label>
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {action === "phone_screen" && (
                  <p className="text-xs text-zinc-500">
                    Creates: 1h prep block before + phone screen + 30min debrief after
                  </p>
                )}
                {action === "interview" && (
                  <p className="text-xs text-zinc-500">
                    Creates: 2h prep block day before + interview + 30min debrief after
                  </p>
                )}
                {action === "offer_deadline" && (
                  <p className="text-xs text-zinc-500">
                    Creates a reminder event at the selected date with a 1-day advance notification.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSchedule} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    Creating events...
                  </>
                ) : (
                  <>
                    <Check className="size-3.5 mr-1.5" />
                    {ACTION_LABELS[action]}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
