"use client"

import { useState } from "react"
import { StatusBadge } from "@/components/shared/status-badge"
import { STATUSES } from "@/lib/constants"
import { ExternalLink, Trash2, Save, Sparkles, FileCheck, CalendarDays, CalendarCheck } from "lucide-react"
import { TailorModal } from "@/components/applications/tailor-modal"
import { ScheduleModal } from "@/components/applications/schedule-modal"
import type { Application, ApplicationStatus } from "@/types"

const SCHEDULABLE_STATUSES: ApplicationStatus[] = ["applied", "phone_screen", "interview", "offer"]

interface ApplicationRowProps {
  application: Application
  onUpdate: (id: string, updates: Partial<Application>) => Promise<unknown>
  onDelete: (id: string) => Promise<void>
  onClick?: () => void
}

export function ApplicationRow({
  application,
  onUpdate,
  onDelete,
  onClick,
}: ApplicationRowProps) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(application.notes || "")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tailorOpen, setTailorOpen] = useState(false)
  const [tailorViewMode, setTailorViewMode] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await onUpdate(application.id, {
      status: e.target.value as ApplicationStatus,
    })
  }

  async function handleSaveNotes() {
    await onUpdate(application.id, { notes })
    setEditingNotes(false)
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    await onDelete(application.id)
  }

  const dateStr = application.date_found
    ? new Date(application.date_found).toLocaleDateString()
    : ""

  return (
    <div
      className="bg-white rounded-xl border border-zinc-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm text-zinc-900 leading-tight truncate">
              {application.title}
            </span>
            {application.url && (
              <a
                href={application.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-blue-600 transition-colors flex-shrink-0"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <div className="text-xs text-zinc-500 mb-2">
            {application.company}
            {application.location ? ` · ${application.location}` : ""}
            {dateStr ? ` · ${dateStr}` : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={application.status} />
            {application.source && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                {application.source}
              </span>
            )}
            {application.salary_range && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {application.salary_range}
              </span>
            )}
            {application.job_type && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                {application.job_type}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Status dropdown */}
          <select
            value={application.status}
            onChange={handleStatusChange}
            className="text-[11px] px-2 py-1 rounded-md border border-zinc-200 bg-white text-zinc-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300"
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Tailor Resume */}
          {application.url && application.tailored_resume ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setTailorViewMode(true)
                  setTailorOpen(true)
                }}
                className="text-[10px] font-semibold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 transition-colors flex items-center gap-1 hover:bg-emerald-100"
                title="View saved tailored resume"
              >
                <FileCheck size={10} />
                Tailored
              </button>
              <button
                onClick={() => {
                  setTailorViewMode(false)
                  setTailorOpen(true)
                }}
                className="text-[10px] font-semibold px-2 py-1 rounded-md text-zinc-400 hover:text-amber-600 transition-colors flex items-center gap-1"
                title="Generate a new tailored resume"
              >
                <Sparkles size={10} />
              </button>
            </div>
          ) : application.url ? (
            <button
              onClick={() => {
                setTailorViewMode(false)
                setTailorOpen(true)
              }}
              className="text-[10px] font-semibold px-2 py-1 rounded-md text-zinc-400 hover:text-amber-600 transition-colors flex items-center gap-1"
              title="Tailor resume for this job"
            >
              <Sparkles size={10} />
              Tailor
            </button>
          ) : null}

          {/* Schedule */}
          {SCHEDULABLE_STATUSES.includes(application.status) && (
            <button
              onClick={() => setScheduleOpen(true)}
              className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                application.calendar_event_id
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-zinc-400 hover:text-blue-600"
              }`}
              title={application.calendar_event_id ? "Calendar events exist — click to add more" : "Schedule calendar events"}
            >
              {application.calendar_event_id ? <CalendarCheck size={10} /> : <CalendarDays size={10} />}
              {application.calendar_event_id ? "Scheduled" : "Schedule"}
            </button>
          )}

          {/* Delete */}
          <button
            onClick={handleDelete}
            className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
              confirmDelete
                ? "bg-red-100 text-red-700 border border-red-300"
                : "text-zinc-400 hover:text-red-500"
            }`}
          >
            <Trash2 size={10} />
            {confirmDelete ? "Confirm?" : "Delete"}
          </button>
        </div>
      </div>

      <TailorModal
        application={application}
        open={tailorOpen}
        onOpenChange={setTailorOpen}
        viewMode={tailorViewMode}
        onSave={async (tailoredResume) => {
          await onUpdate(application.id, { tailored_resume: tailoredResume })
        }}
      />

      <ScheduleModal
        application={application}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onSave={async (updates) => {
          await onUpdate(application.id, updates)
        }}
      />

      {/* Notes section */}
      <div className="mt-3 pt-3 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
        {editingNotes ? (
          <div className="flex gap-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              className="flex-1 text-xs border border-zinc-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
              rows={2}
            />
            <button
              onClick={handleSaveNotes}
              className="text-[10px] font-semibold px-2 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors self-start flex items-center gap-1"
            >
              <Save size={10} /> Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            {application.notes
              ? application.notes
              : "Add notes..."}
          </button>
        )}
      </div>
    </div>
  )
}
