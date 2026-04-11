"use client"

import { useState, useRef, useCallback } from "react"
import { formatDistanceToNow } from "date-fns"
import { Mail, Phone, Building2, Briefcase, Clock, Edit, Trash2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { STATUSES } from "@/lib/constants"
import type { Contact, ContactWithLinks } from "@/types"

interface ContactSummaryCardProps {
  contact: ContactWithLinks
  onNotesChange: (notes: string) => Promise<void>
  onEditClick: () => void
  onDeleteClick: () => void
}

function getStatusConfig(status: string) {
  return STATUSES.find((s) => s.id === status) ?? { label: status, color: "#6b7280", bg: "#f3f4f6" }
}

export function ContactSummaryCard({
  contact,
  onNotesChange,
  onEditClick,
  onDeleteClick,
}: ContactSummaryCardProps) {
  const [notes, setNotes] = useState(contact.notes || "")
  const [notesSaved, setNotesSaved] = useState(false)
  const [showAllApps, setShowAllApps] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveNotes = useCallback(() => {
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await onNotesChange(notes)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 3000)
    }, 800)
  }, [notes, onNotesChange])

  const linkedApps = contact.applications ?? []
  const visibleApps = showAllApps ? linkedApps : linkedApps.slice(0, 3)
  const hiddenCount = linkedApps.length - 3

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-5">
      {/* Header: name, company/title, action buttons */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900 leading-tight truncate">
            {contact.name}
          </h1>
          {(contact.title || contact.company) && (
            <p className="text-sm text-zinc-500 mt-0.5 truncate">
              {[contact.title, contact.company].filter(Boolean).join(" at ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onEditClick}>
            <Edit size={13} />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDeleteClick}>
            <Trash2 size={13} />
            Delete
          </Button>
        </div>
      </div>

      {/* Contact info rows */}
      <div className="space-y-2">
        {contact.email && (
          <div className="flex items-center gap-2.5 text-sm text-zinc-700">
            <Mail size={14} className="text-zinc-400 flex-shrink-0" />
            <a
              href={`mailto:${contact.email}`}
              className="hover:text-blue-600 hover:underline truncate"
            >
              {contact.email}
            </a>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2.5 text-sm text-zinc-700">
            <Phone size={14} className="text-zinc-400 flex-shrink-0" />
            <a
              href={`tel:${contact.phone}`}
              className="hover:text-blue-600 hover:underline"
            >
              {contact.phone}
            </a>
          </div>
        )}
        {contact.company && (
          <div className="flex items-center gap-2.5 text-sm text-zinc-700">
            <Building2 size={14} className="text-zinc-400 flex-shrink-0" />
            <span>{contact.company}</span>
          </div>
        )}
        {contact.title && (
          <div className="flex items-center gap-2.5 text-sm text-zinc-700">
            <Briefcase size={14} className="text-zinc-400 flex-shrink-0" />
            <span>{contact.title}</span>
          </div>
        )}
        {contact.last_contact_date && (
          <div className="flex items-center gap-2.5 text-sm text-zinc-500">
            <Clock size={14} className="text-zinc-400 flex-shrink-0" />
            <span>
              Last contact:{" "}
              {formatDistanceToNow(new Date(contact.last_contact_date), { addSuffix: true })}
            </span>
          </div>
        )}
      </div>

      {/* Source badge */}
      {contact.source && contact.source !== "manual" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Source:</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 capitalize">
            {contact.source.replace(/_/g, " ")}
          </span>
        </div>
      )}

      {/* Linked applications */}
      {linkedApps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Linked Applications
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleApps.map((app) => {
              const sc = getStatusConfig(app.status)
              return (
                <a
                  key={app.id}
                  href="/applications"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors hover:opacity-80"
                  style={{
                    color: sc.color,
                    backgroundColor: sc.bg,
                    borderColor: sc.color + "33",
                  }}
                  title={`${app.title} at ${app.company}`}
                >
                  <span className="truncate max-w-[140px]">{app.title}</span>
                  <span className="opacity-70 flex-shrink-0">{sc.label}</span>
                </a>
              )
            })}
            {!showAllApps && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllApps(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                +{hiddenCount} more
                <ChevronDown size={11} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes about this contact..."
          className="w-full text-sm border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300 min-h-[80px] text-zinc-700 placeholder:text-zinc-300"
          rows={3}
        />
        {notesSaved && (
          <p className="text-[10px] text-emerald-600">Saved</p>
        )}
      </div>
    </div>
  )
}
