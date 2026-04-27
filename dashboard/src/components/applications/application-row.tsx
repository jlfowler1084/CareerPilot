// CAR-99: Conversations, intelligence, and interview prep data are lazy-loaded
// on row expansion only. This prevents the N+1 query storm that previously
// crashed Node.js with OOM when all rows fetched independently on mount.
// The `enabled` parameter on each hook gates the actual fetch — hooks are
// still called unconditionally per React rules.
"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { StatusBadge } from "@/components/shared/status-badge"
import { ConversationSection } from "@/components/conversations/conversation-section"
import { CommunicationsSection } from "@/components/applications/communications-section"
import { InterviewPrepSection } from "@/components/applications/interview-prep-section"
import { CoachingSection } from "@/components/coaching/coaching-section"
import { IntelligenceTab } from "@/components/intelligence/intelligence-tab"
import { ResearchTab } from "@/components/intelligence/research-tab"
import { TailorModal } from "@/components/applications/tailor-modal"
import { CoverLetterModal } from "@/components/applications/cover-letter-modal"
import { ScheduleModal } from "@/components/applications/schedule-modal"
import { PrepPackModal } from "@/components/applications/prep-pack-modal"
import { toIntelligenceSnapshot } from "@/lib/prep-pack/adapter"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { useIntelligence } from "@/hooks/use-intelligence"
import { useApplicationEvents } from "@/hooks/use-application-events"
import { STATUSES } from "@/lib/constants"
import { RelativeTime } from "@/components/ui/relative-time"
import { ExternalLink, Trash2, Save, Mail, Phone, Sparkles, FileCheck, CalendarDays, CalendarCheck, FileText, BrainCircuit, ChevronDown, ChevronRight, Download, Loader2, FileSearch, Headphones } from "lucide-react"
import type { Application, ApplicationStatus, ApplicationEvent } from "@/types"

const EVENT_ICONS: Record<string, string> = {
  status_change: "\uD83D\uDD04",
  note_added: "\uD83D\uDCDD",
  resume_tailored: "\u2728",
  calendar_scheduled: "\uD83D\uDCC5",
  contact_added: "\uD83D\uDC64",
  cover_letter_generated: "\uD83D\uDCE8",
  follow_up: "\uD83D\uDCDE",
}

const SCHEDULABLE_STATUSES: ApplicationStatus[] = ["applied", "phone_screen", "interview", "offer"]

interface ApplicationRowProps {
  application: Application
  onUpdate: (id: string, updates: Partial<Application>) => Promise<unknown>
  onUpdateContact: (
    id: string,
    contact: Pick<Application, "contact_name" | "contact_email" | "contact_phone" | "contact_role">
  ) => Promise<unknown>
  onUpdateNotes: (id: string, notes: string) => Promise<unknown>
  onUpdateJobDescription: (id: string, jobDescription: string) => Promise<unknown>
  onDelete: (id: string) => Promise<void>
  autoUpdatedViaEmail?: boolean
}

export function ApplicationRow({
  application,
  onUpdate,
  onUpdateContact,
  onUpdateNotes,
  onUpdateJobDescription,
  onDelete,
  autoUpdatedViaEmail,
}: ApplicationRowProps) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(application.notes || "")
  const [jobDesc, setJobDesc] = useState(application.job_description || "")
  const [fetchingJd, setFetchingJd] = useState(false)
  const [contactName, setContactName] = useState(application.contact_name || "")
  const [contactEmail, setContactEmail] = useState(application.contact_email || "")
  const [contactPhone, setContactPhone] = useState(application.contact_phone || "")
  const [contactRole, setContactRole] = useState(application.contact_role || "")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tailorOpen, setTailorOpen] = useState(false)
  const [tailorViewMode, setTailorViewMode] = useState(false)
  const [coverLetterOpen, setCoverLetterOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [prepPackOpen, setPrepPackOpen] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const { hasData: hasIntelligence, brief, preps, loading: intelligenceLoading } =
    useIntelligence(application.id, isExpanded || prepPackOpen)

  // CAR-188 Unit 7: when the page is opened with ?focus=<id>&tab=research,
  // auto-expand the matching row and pre-select the tab. The Track flow on
  // /search uses this so SC4 ("land on Research tab") holds without forcing
  // a per-application route. handledFocusRef gates the scroll/expand to the
  // first match — subsequent renders should not re-fight the user's clicks.
  const searchParams = useSearchParams()
  const focusedId = searchParams?.get("focus") ?? null
  const focusedTab = searchParams?.get("tab") ?? null
  const isFocused = focusedId === application.id
  const initialTabValue = isFocused && focusedTab ? focusedTab : "details"
  const handledFocusRef = useRef(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!isFocused || handledFocusRef.current) return
    handledFocusRef.current = true
    setIsExpanded(true)
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [isFocused])

  const prepPackSnapshot = useMemo(
    () => toIntelligenceSnapshot(application, { brief, preps }),
    [application, brief, preps],
  )

  const prepPackDisabled = !brief && preps.length === 0

  const { events, loading: eventsLoading } = useApplicationEvents(
    isExpanded ? application.id : null
  )

  // Sync local contact state when application changes via realtime
  useEffect(() => {
    setContactName(application.contact_name || "")
    setContactEmail(application.contact_email || "")
    setContactPhone(application.contact_phone || "")
    setContactRole(application.contact_role || "")
  }, [application.contact_name, application.contact_email, application.contact_phone, application.contact_role])

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusUpdating(true)
    try {
      await onUpdate(application.id, {
        status: e.target.value as ApplicationStatus,
      })
    } finally {
      setStatusUpdating(false)
    }
  }

  async function handleSaveNotes() {
    await onUpdateNotes(application.id, notes)
    setEditingNotes(false)
  }

  async function saveJobDesc() {
    if (jobDesc === (application.job_description || "")) return
    await onUpdateJobDescription(application.id, jobDesc)
  }

  async function saveContact() {
    const current = {
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      contact_role: contactRole || null,
    }
    const unchanged =
      current.contact_name === (application.contact_name ?? null) &&
      current.contact_email === (application.contact_email ?? null) &&
      current.contact_phone === (application.contact_phone ?? null) &&
      current.contact_role === (application.contact_role ?? null)
    if (unchanged) return
    await onUpdateContact(application.id, current)
  }

  async function fetchJobDescFromUrl() {
    if (!application.url) return
    setFetchingJd(true)
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
      if (Object.keys(updates).length > 0) {
        await onUpdate(application.id, updates)
        toast.success("Job details updated")
      } else {
        toast.info("No new details found")
      }
    } catch {
      toast.error("Failed to connect to extraction service")
    } finally {
      setFetchingJd(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    await onDelete(application.id)
  }

  const hasDate = !!application.date_found

  return (
    <div
      ref={rowRef}
      className="bg-white rounded-xl border border-zinc-200 p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsExpanded(!isExpanded) } }}
        >
          <div className="flex items-center gap-2 mb-1">
            {isExpanded ? <ChevronDown size={12} className="text-zinc-400 flex-shrink-0" /> : <ChevronRight size={12} className="text-zinc-400 flex-shrink-0" />}
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
          <div className="text-xs text-zinc-500 mb-2 flex items-center gap-1 flex-wrap">
            <span>{application.company}</span>
            {application.location && <span>· {application.location}</span>}
            {hasDate && (
              <>
                <span>·</span>
                <RelativeTime date={application.date_found} className="text-xs text-zinc-400" />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={application.status} />
            {autoUpdatedViaEmail && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-200">
                <Mail size={9} />
                via email
              </span>
            )}
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
            disabled={statusUpdating}
            className="text-[11px] px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300 disabled:opacity-50 min-h-[28px]"
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

          {/* Cover Letter */}
          {application.url && (
            <button
              onClick={() => setCoverLetterOpen(true)}
              className="text-[10px] font-semibold px-2 py-1 rounded-md text-zinc-400 hover:text-blue-600 transition-colors flex items-center gap-1"
              title="Generate cover letter for this job"
            >
              <FileText size={10} />
              Cover Letter
            </button>
          )}

          {/* Prep Pack */}
          <button
            onClick={() => setPrepPackOpen(true)}
            disabled={prepPackDisabled}
            className="text-[10px] font-semibold px-2 py-1 rounded-md text-zinc-400 hover:text-violet-600 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title={prepPackDisabled ? "Fill in Company Research or Interview Prep first" : "Generate audiobook + Kindle ebook"}
          >
            <Headphones size={10} />
            Prep Pack
          </button>

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
            type="button"
            onClick={handleDelete}
            className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1 min-h-[28px] ${
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

      <CoverLetterModal
        application={application}
        open={coverLetterOpen}
        onOpenChange={setCoverLetterOpen}
      />

      <ScheduleModal
        application={application}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onSave={async (updates) => {
          await onUpdate(application.id, updates)
        }}
      />

      <PrepPackModal
        open={prepPackOpen}
        onOpenChange={setPrepPackOpen}
        intelligence={prepPackSnapshot}
        intelligenceLoading={intelligenceLoading}
      />

      {/* Tab navigation — only rendered when expanded */}
      {isExpanded && (
      <div className="mt-3 pt-3 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
        <Tabs defaultValue={initialTabValue}>
          <TabsList variant="line" className="w-full justify-start gap-0 h-7 mb-2">
            <TabsTrigger value="details" className="text-xs px-3 py-1 h-7">
              Details
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="text-xs px-3 py-1 h-7 flex items-center gap-1.5">
              <BrainCircuit size={12} />
              Intelligence
              {hasIntelligence && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="research" className="text-xs px-3 py-1 h-7 flex items-center gap-1.5">
              <FileSearch size={12} />
              Research
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            {/* Notes section */}
            <div>
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

            {/* Job Description (feeds Intelligence) */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-600">
                  Job Description
                </label>
                {!jobDesc && application.url && (
                  <button
                    type="button"
                    onClick={fetchJobDescFromUrl}
                    disabled={fetchingJd}
                    className="text-[10px] font-semibold px-2 py-1 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors flex items-center gap-1 disabled:opacity-50"
                    title="Fetch job description from the application URL"
                  >
                    {fetchingJd ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Download size={10} />
                    )}
                    {fetchingJd ? "Fetching..." : "Fetch from URL"}
                  </button>
                )}
              </div>
              <textarea
                value={jobDesc}
                onChange={(e) => setJobDesc(e.target.value)}
                onBlur={saveJobDesc}
                placeholder="Paste the job description here so Intelligence can use it..."
                className="w-full text-xs border border-zinc-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300 min-h-[80px]"
                rows={4}
              />
            </div>

            {/* Calendar Events */}
            {(application.calendar_event_id || application.interview_date || application.follow_up_date) && (
              <div className="mt-3 pt-3 border-t border-zinc-100">
                <div className="text-xs font-medium text-zinc-600 mb-1.5">Calendar Events</div>
                <div className="space-y-1.5">
                  {application.interview_date && (
                    <div className="flex items-center gap-2 text-xs text-zinc-700">
                      <CalendarCheck size={12} className="text-blue-600" />
                      <span>Interview: {new Date(application.interview_date).toLocaleString()}</span>
                    </div>
                  )}
                  {application.follow_up_date && (
                    <div className="flex items-center gap-2 text-xs text-zinc-700">
                      <CalendarDays size={12} className="text-amber-600" />
                      <span>Follow-up: {new Date(application.follow_up_date).toLocaleString()}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Add more events
                  </button>
                </div>
              </div>
            )}

            {/* Contact Info */}
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <div className="text-xs font-medium text-zinc-600 mb-1.5">Contact Info</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  onBlur={saveContact}
                  placeholder="Contact name"
                  className="h-8 text-xs"
                />
                <select
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  onBlur={saveContact}
                  title="Contact role"
                  aria-label="Contact role"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
                >
                  <option value="">Select role...</option>
                  <option value="Recruiter">Recruiter</option>
                  <option value="Hiring Manager">Hiring Manager</option>
                  <option value="HR">HR</option>
                  <option value="Other">Other</option>
                </select>
                <div className="flex items-center gap-1">
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    onBlur={saveContact}
                    placeholder="email@example.com"
                    className="h-8 text-xs flex-1"
                  />
                  {contactEmail && (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="text-zinc-400 hover:text-blue-600"
                      title="Email contact"
                    >
                      <Mail size={12} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    onBlur={saveContact}
                    placeholder="(555) 123-4567"
                    className="h-8 text-xs flex-1"
                  />
                  {contactPhone && (
                    <a
                      href={`tel:${contactPhone}`}
                      className="text-zinc-400 hover:text-blue-600"
                      title="Call contact"
                    >
                      <Phone size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <div className="text-xs font-medium text-zinc-600 mb-1.5">Activity Timeline</div>
              {eventsLoading ? (
                <div className="text-xs text-zinc-400 animate-pulse">Loading timeline...</div>
              ) : events.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {events.map((event: ApplicationEvent) => (
                    <div key={event.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 text-sm leading-none">
                        {EVENT_ICONS[event.event_type] || "\u2022"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-700">{event.description}</p>
                        <p className="text-zinc-400 mt-0.5">
                          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">No activity yet.</p>
              )}
            </div>

            {/* Expandable sections */}
            <div>
              {/* Communications (linked emails) */}
              <CommunicationsSection application={application} />

              {/* Conversations */}
              <ConversationSection application={application} />

              {/* Interview Prep */}
              <InterviewPrepSection application={application} />

              {/* Performance Coach */}
              <CoachingSection application={application} />
            </div>
          </TabsContent>

          <TabsContent value="intelligence">
            <IntelligenceTab applicationId={application.id} />
          </TabsContent>

          <TabsContent value="research">
            <ResearchTab
              applicationId={application.id}
              companyName={application.company}
              enabled={isExpanded}
            />
          </TabsContent>
        </Tabs>
      </div>
      )}
    </div>
  )
}
