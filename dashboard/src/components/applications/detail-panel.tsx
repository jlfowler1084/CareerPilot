"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STATUSES, CONVERSATION_TYPES } from "@/lib/constants"
import { useApplicationEvents } from "@/hooks/use-application-events"
import { TailorModal } from "@/components/applications/tailor-modal"
import { ScheduleModal } from "@/components/applications/schedule-modal"
import { CommunicationsSection } from "@/components/applications/communications-section"
import { LinkConversationModal } from "@/components/applications/link-conversation-modal"
import { formatDistanceToNow } from "date-fns"
import {
  ExternalLink,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  CalendarCheck,
  Sparkles,
  FileCheck,
  RefreshCw,
  Mail,
  Phone,
  Loader2,
  Download,
  MessageSquare,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import type { Application, ApplicationStatus, ApplicationEvent, Conversation } from "@/types"

const supabase = createClient()

// --- Event type icons ---
const EVENT_ICONS: Record<string, string> = {
  status_change: "\uD83D\uDD04",
  note_added: "\uD83D\uDCDD",
  resume_tailored: "\u2728",
  calendar_scheduled: "\uD83D\uDCC5",
  contact_added: "\uD83D\uDC64",
  cover_letter_generated: "\uD83D\uDCE8",
  follow_up: "\uD83D\uDCDE",
}

// --- Collapsible section ---
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-zinc-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-3 px-4 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// --- Conversations Section ---
function ConversationsSection({ application }: { application: Application }) {
  const [open, setOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const { user } = useAuth()

  const fetchConversations = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("application_id", application.id)
      .order("date", { ascending: false })
    setConversations(data || [])
    setLoading(false)
  }, [application.id, user])

  useEffect(() => {
    if (open) fetchConversations()
  }, [open, fetchConversations])

  // Auto-open if conversations exist on first load
  useEffect(() => {
    async function checkCount() {
      if (!user) return
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("application_id", application.id)
      if ((count ?? 0) > 0) setOpen(true)
    }
    checkCount()
  }, [application.id, user])

  function getTypeIcon(type: string): string {
    const found = CONVERSATION_TYPES.find((ct) => ct.id === type)
    return found ? found.icon : "\uD83D\uDCAC"
  }

  return (
    <div className="border-t border-zinc-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-3 px-4 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Conversations
        {conversations.length > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
            {conversations.length}
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 py-3 justify-center">
              <Loader2 size={14} className="text-violet-500 animate-spin" />
              <span className="text-xs text-zinc-500">Loading conversations...</span>
            </div>
          )}

          {!loading && conversations.length === 0 && (
            <div className="text-center py-4 space-y-2">
              <p className="text-xs text-zinc-400">No conversations linked yet</p>
              <button
                type="button"
                onClick={() => setLinkModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
              >
                <MessageSquare size={12} /> Link Existing Conversation
              </button>
            </div>
          )}

          {!loading && conversations.map((conv) => (
            <div
              key={conv.id}
              className="rounded-lg border border-zinc-100 px-3 py-2.5 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm leading-none">{getTypeIcon(conv.conversation_type)}</span>
                <span className="text-xs font-medium text-zinc-700 truncate flex-1">
                  {conv.title || "(no title)"}
                </span>
                <span className="text-[10px] text-zinc-400 flex-shrink-0">
                  {formatDistanceToNow(new Date(conv.date), { addSuffix: true })}
                </span>
              </div>
              {conv.sentiment !== null && (
                <div className="flex items-center gap-0.5 pl-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={`text-[10px] ${i < (conv.sentiment ?? 0) ? "text-amber-400" : "text-zinc-200"}`}
                    >
                      ★
                    </span>
                  ))}
                </div>
              )}
              {conv.notes && (
                <p className="text-[11px] text-zinc-500 pl-6">
                  {conv.notes.slice(0, 100)}{conv.notes.length > 100 ? "…" : ""}
                </p>
              )}
            </div>
          ))}

          {!loading && conversations.length > 0 && (
            <button
              type="button"
              onClick={() => setLinkModalOpen(true)}
              className="w-full text-center py-1.5 text-[10px] text-violet-500 hover:text-violet-700 transition-colors"
            >
              + Link another conversation
            </button>
          )}
        </div>
      )}

      <LinkConversationModal
        applicationId={application.id}
        companyName={application.company}
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        onLinked={fetchConversations}
      />
    </div>
  )
}

// --- Detail Panel Props ---
interface DetailPanelProps {
  application: Application
  open: boolean
  onClose: () => void
  onUpdate: (id: string, updates: Partial<Application>) => Promise<unknown>
  onUpdateContact: (
    id: string,
    contact: Pick<Application, "contact_name" | "contact_email" | "contact_phone" | "contact_role">
  ) => Promise<unknown>
  onUpdateNotes: (id: string, notes: string) => Promise<unknown>
  onUpdateJobDescription: (id: string, jobDescription: string) => Promise<unknown>
}

export function DetailPanel({
  application,
  open,
  onClose,
  onUpdate,
  onUpdateContact,
  onUpdateNotes,
  onUpdateJobDescription,
}: DetailPanelProps) {
  // --- Contact state ---
  const [contactName, setContactName] = useState(application.contact_name || "")
  const [contactEmail, setContactEmail] = useState(application.contact_email || "")
  const [contactPhone, setContactPhone] = useState(application.contact_phone || "")
  const [contactRole, setContactRole] = useState(application.contact_role || "")
  const contactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Notes state ---
  const [notes, setNotes] = useState(application.notes || "")
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [notesSaved, setNotesSaved] = useState(false)

  // --- Job description state ---
  const [jobDesc, setJobDesc] = useState(application.job_description || "")
  const jobDescTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [fetching, setFetching] = useState(false)

  // --- Modals ---
  const [tailorOpen, setTailorOpen] = useState(false)
  const [tailorViewMode, setTailorViewMode] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  // --- Events ---
  const { events, loading: eventsLoading } = useApplicationEvents(
    open ? application.id : null
  )

  // Sync local state when application changes
  useEffect(() => {
    setContactName(application.contact_name || "")
    setContactEmail(application.contact_email || "")
    setContactPhone(application.contact_phone || "")
    setContactRole(application.contact_role || "")
    setNotes(application.notes || "")
    setJobDesc(application.job_description || "")
    setNotesSaved(false)
  }, [application])

  // --- Auto-save contact on blur with debounce ---
  const saveContact = useCallback(() => {
    if (contactTimer.current) clearTimeout(contactTimer.current)
    contactTimer.current = setTimeout(() => {
      onUpdateContact(application.id, {
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        contact_role: contactRole || null,
      })
    }, 500)
  }, [application.id, contactName, contactEmail, contactPhone, contactRole, onUpdateContact])

  // --- Auto-save notes on blur with debounce ---
  const saveNotes = useCallback(() => {
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await onUpdateNotes(application.id, notes)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 3000)
    }, 1000)
  }, [application.id, notes, onUpdateNotes])

  // --- Auto-save job description on blur ---
  const saveJobDesc = useCallback(() => {
    if (jobDescTimer.current) clearTimeout(jobDescTimer.current)
    jobDescTimer.current = setTimeout(() => {
      onUpdateJobDescription(application.id, jobDesc)
    }, 1000)
  }, [application.id, jobDesc, onUpdateJobDescription])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (contactTimer.current) clearTimeout(contactTimer.current)
      if (notesTimer.current) clearTimeout(notesTimer.current)
      if (jobDescTimer.current) clearTimeout(jobDescTimer.current)
    }
  }, [])

  // --- Fetch job details from URL ---
  const fetchFromUrl = useCallback(async () => {
    if (!application.url) return
    setFetching(true)
    try {
      const res = await fetch("/api/extract-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: application.url }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || "Failed to fetch job details")
        return
      }
      const data = json.data
      const updates: Partial<Application> = {}
      if (data.job_description) {
        updates.job_description = data.job_description
        setJobDesc(data.job_description)
      }
      if (data.location && !application.location) updates.location = data.location
      if (data.salary_range && !application.salary_range) updates.salary_range = data.salary_range
      if (data.job_type && !application.job_type) updates.job_type = data.job_type
      if (data.contact_name && !application.contact_name) {
        updates.contact_name = data.contact_name
        setContactName(data.contact_name)
      }
      if (data.contact_email && !application.contact_email) {
        updates.contact_email = data.contact_email
        setContactEmail(data.contact_email)
      }
      if (Object.keys(updates).length > 0) {
        await onUpdate(application.id, updates)
        toast.success("Job details updated")
      } else {
        toast.info("No new details found")
      }
    } catch {
      toast.error("Failed to connect to extraction service")
    } finally {
      setFetching(false)
    }
  }, [application, onUpdate])

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent>
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* ===== Section 1: Header (always visible) ===== */}
            <SheetHeader className="p-4 pb-4">
              <div className="flex items-start gap-2 pr-8">
                <SheetTitle className="text-lg leading-snug">
                  {application.title}
                </SheetTitle>
                {application.url && (
                  <a
                    href={application.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-blue-600 transition-colors flex-shrink-0 mt-0.5"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
              <SheetDescription>
                {application.company}
                {application.location ? ` \u00B7 ${application.location}` : ""}
              </SheetDescription>

              {/* Status dropdown */}
              <div className="mt-3">
                <select
                  value={application.status}
                  onChange={(e) =>
                    onUpdate(application.id, {
                      status: e.target.value as ApplicationStatus,
                    })
                  }
                  className="text-xs px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300"
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick action buttons */}
              <div className="flex items-center gap-2 mt-3">
                {application.url && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setTailorViewMode(false)
                      setTailorOpen(true)
                    }}
                  >
                    <Sparkles size={12} />
                    Tailor
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setScheduleOpen(true)}
                >
                  <CalendarDays size={12} />
                  Schedule
                </Button>
              </div>
            </SheetHeader>

            {/* ===== Section 2: Calendar Events ===== */}
            <Section title="Calendar Events" defaultOpen={!!application.calendar_event_id}>
              {application.calendar_event_id ? (
                <div className="space-y-2">
                  {application.interview_date && (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarCheck size={14} className="text-blue-600" />
                      <span>
                        Interview:{" "}
                        {new Date(application.interview_date).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {application.follow_up_date && (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays size={14} className="text-amber-600" />
                      <span>
                        Follow-up:{" "}
                        {new Date(application.follow_up_date).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setScheduleOpen(true)}
                  >
                    Add more events
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-zinc-500">
                  No events scheduled.{" "}
                  <button
                    onClick={() => setScheduleOpen(true)}
                    className="text-amber-600 hover:text-amber-800 font-medium"
                  >
                    Schedule
                  </button>
                </div>
              )}
            </Section>

            {/* ===== Section 3: Tailored Resume ===== */}
            <Section title="Tailored Resume" defaultOpen={!!application.tailored_resume}>
              {application.tailored_resume ? (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-900 line-clamp-3">
                      {application.tailored_resume.split("\n")[0]}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setTailorViewMode(true)
                        setTailorOpen(true)
                      }}
                    >
                      <FileCheck size={12} />
                      View Full Resume
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setTailorViewMode(false)
                        setTailorOpen(true)
                      }}
                    >
                      <RefreshCw size={12} />
                      Re-tailor
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-500">
                  No tailored resume yet.{" "}
                  {application.url && (
                    <button
                      onClick={() => {
                        setTailorViewMode(false)
                        setTailorOpen(true)
                      }}
                      className="text-amber-600 hover:text-amber-800 font-medium"
                    >
                      Tailor Resume
                    </button>
                  )}
                </div>
              )}
            </Section>

            {/* ===== Section 4: Contact Info ===== */}
            <Section title="Contact Info" defaultOpen={!!application.contact_name}>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1 block">
                    Name
                  </label>
                  <Input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    onBlur={saveContact}
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1 block">
                    Email
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      onBlur={saveContact}
                      placeholder="email@example.com"
                      className="flex-1"
                    />
                    {contactEmail && (
                      <a
                        href={`mailto:${contactEmail}`}
                        className="text-zinc-400 hover:text-blue-600"
                      >
                        <Mail size={14} />
                      </a>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1 block">
                    Phone
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      onBlur={saveContact}
                      placeholder="(555) 123-4567"
                      className="flex-1"
                    />
                    {contactPhone && (
                      <a
                        href={`tel:${contactPhone}`}
                        className="text-zinc-400 hover:text-blue-600"
                      >
                        <Phone size={14} />
                      </a>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1 block">
                    Role
                  </label>
                  <select
                    value={contactRole}
                    onChange={(e) => {
                      setContactRole(e.target.value)
                      // Save immediately on select change
                      if (contactTimer.current) clearTimeout(contactTimer.current)
                      contactTimer.current = setTimeout(() => {
                        onUpdateContact(application.id, {
                          contact_name: contactName || null,
                          contact_email: contactEmail || null,
                          contact_phone: contactPhone || null,
                          contact_role: e.target.value || null,
                        })
                      }, 500)
                    }}
                    className="w-full h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
                  >
                    <option value="">Select role...</option>
                    <option value="Recruiter">Recruiter</option>
                    <option value="Hiring Manager">Hiring Manager</option>
                    <option value="HR">HR</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </Section>

            {/* ===== Section 5: Activity Timeline ===== */}
            <Section title="Activity Timeline" defaultOpen>
              {eventsLoading ? (
                <div className="text-xs text-zinc-400 animate-pulse">
                  Loading timeline...
                </div>
              ) : events.length > 0 ? (
                <div className="space-y-2">
                  {events.map((event: ApplicationEvent) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="mt-0.5 text-sm leading-none">
                        {EVENT_ICONS[event.event_type] || "\u2022"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-700">{event.description}</p>
                        <p className="text-zinc-400 mt-0.5">
                          {formatDistanceToNow(new Date(event.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">No activity yet.</p>
              )}
            </Section>

            {/* ===== Section 5.5: Conversations ===== */}
            <ConversationsSection application={application} />

            {/* ===== Section 6: Communications ===== */}
            <CommunicationsSection application={application} />

            {/* ===== Section 7: Notes ===== */}
            <Section title="Notes" defaultOpen={!!application.notes}>
              <div className="space-y-2">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="Add notes..."
                  className="w-full text-sm border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300 min-h-[100px]"
                  rows={4}
                />
                {notesSaved && (
                  <p className="text-[10px] text-emerald-600">Saved</p>
                )}
                {application.updated_at && (
                  <p className="text-[10px] text-zinc-400">
                    Last edited:{" "}
                    {formatDistanceToNow(new Date(application.updated_at), {
                      addSuffix: true,
                    })}
                  </p>
                )}
              </div>
            </Section>

            {/* ===== Section 7: Job Details ===== */}
            <Section title="Job Details" defaultOpen>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {application.salary_range && (
                    <>
                      <span className="text-zinc-500 font-medium">Salary</span>
                      <span className="text-zinc-800">
                        {application.salary_range}
                      </span>
                    </>
                  )}
                  {application.job_type && (
                    <>
                      <span className="text-zinc-500 font-medium">Type</span>
                      <span className="text-zinc-800">
                        {application.job_type}
                      </span>
                    </>
                  )}
                  {application.location && (
                    <>
                      <span className="text-zinc-500 font-medium">
                        Location
                      </span>
                      <span className="text-zinc-800">
                        {application.location}
                      </span>
                    </>
                  )}
                  {application.source && (
                    <>
                      <span className="text-zinc-500 font-medium">Source</span>
                      <span className="text-zinc-800">
                        {application.source}
                      </span>
                    </>
                  )}
                  {application.posted_date && (
                    <>
                      <span className="text-zinc-500 font-medium">Posted</span>
                      <span className="text-zinc-800">
                        {new Date(application.posted_date).toLocaleDateString()}
                      </span>
                    </>
                  )}
                  <span className="text-zinc-500 font-medium">Found</span>
                  <span className="text-zinc-800">
                    {new Date(application.date_found).toLocaleDateString()}
                  </span>
                  {application.date_applied && (
                    <>
                      <span className="text-zinc-500 font-medium">Applied</span>
                      <span className="text-zinc-800">
                        {new Date(
                          application.date_applied
                        ).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-600">
                      Job Description
                    </label>
                    {!jobDesc && application.url && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={fetchFromUrl}
                        disabled={fetching}
                      >
                        {fetching ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Download size={12} />
                        )}
                        {fetching ? "Fetching..." : "Fetch from URL"}
                      </Button>
                    )}
                  </div>
                  <textarea
                    value={jobDesc}
                    onChange={(e) => setJobDesc(e.target.value)}
                    onBlur={saveJobDesc}
                    placeholder="Paste or summarize the job description..."
                    className="w-full text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300 min-h-[80px]"
                    rows={4}
                  />
                </div>
              </div>
            </Section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modals rendered outside sheet to avoid z-index issues */}
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
    </>
  )
}
