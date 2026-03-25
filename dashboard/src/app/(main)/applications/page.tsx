"use client"

import { Suspense, useState, useMemo, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useApplications } from "@/hooks/use-applications"
import { computeStats } from "@/hooks/use-stats"
import { KanbanSummary } from "@/components/applications/kanban-summary"
import { AddForm } from "@/components/applications/add-form"
import { ApplicationRow } from "@/components/applications/application-row"
import { DetailPanel } from "@/components/applications/detail-panel"
import { EmptyState } from "@/components/shared/empty-state"
import { Search, Briefcase } from "lucide-react"
import type { Application, ApplicationStatus } from "@/types"

type SortKey = "date_found" | "company" | "title" | "status"

export default function ApplicationsPage() {
  return (
    <Suspense fallback={
      <div className="p-6">
        <h2 className="text-lg font-bold mb-6">Applications</h2>
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
    }>
      <ApplicationsContent />
    </Suspense>
  )
}

function ApplicationsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const {
    applications,
    loading,
    addApplication,
    updateApplication,
    deleteApplication,
    updateContact,
    updateNotes,
    updateJobDescription,
  } = useApplications()
  const stats = computeStats(applications)

  // Read status filter from URL query params
  const urlStatus = searchParams.get("status") as ApplicationStatus | null
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | null>(urlStatus)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("date_found")
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)

  // Sync URL status param to filter state
  useEffect(() => {
    setStatusFilter(urlStatus)
  }, [urlStatus])

  // Keep selectedApplication in sync with real-time updates
  const currentSelected = selectedApplication
    ? applications.find((a) => a.id === selectedApplication.id) || null
    : null

  const filtered = useMemo(() => {
    let list = [...applications]

    // Status filter
    if (statusFilter) {
      list = list.filter((a) => a.status === statusFilter)
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.company.toLowerCase().includes(q) ||
          (a.location && a.location.toLowerCase().includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q))
      )
    }

    // Sort
    list.sort((a, b) => {
      switch (sortKey) {
        case "date_found":
          return (
            new Date(b.date_found).getTime() -
            new Date(a.date_found).getTime()
          )
        case "company":
          return a.company.localeCompare(b.company)
        case "title":
          return a.title.localeCompare(b.title)
        case "status":
          return a.status.localeCompare(b.status)
        default:
          return 0
      }
    })

    return list
  }, [applications, statusFilter, searchQuery, sortKey])

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-bold mb-6">Applications</h2>
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold">Applications</h2>

      {/* Kanban Summary */}
      <KanbanSummary
        byStatus={stats.by_status}
        activeFilter={statusFilter}
        onFilter={setStatusFilter}
      />

      {/* Add Form */}
      <AddForm onAdd={addApplication} />

      {/* Filter / Sort Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, company, notes..."
            className="w-full text-sm border border-zinc-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="text-xs px-3 py-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300"
        >
          <option value="date_found">Newest First</option>
          <option value="company">Company A-Z</option>
          <option value="title">Title A-Z</option>
          <option value="status">Status</option>
        </select>
        {statusFilter && (
          <button
            onClick={() => {
              setStatusFilter(null)
              if (urlStatus) router.replace("/applications")
            }}
            className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 transition-colors"
          >
            Clear filter
          </button>
        )}
        <span className="text-xs text-zinc-400 ml-auto">
          {filtered.length} of {applications.length}
        </span>
      </div>

      {/* Application List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((app) => (
            <ApplicationRow
              key={app.id}
              application={app}
              onUpdate={updateApplication}
              onDelete={deleteApplication}
              onClick={() => setSelectedApplication(app)}
            />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No applications tracked yet"
          description="Start tracking jobs from search results or add one manually above."
          actions={[
            { label: "Search Jobs", href: "/search" },
          ]}
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
          <p className="text-sm text-zinc-500">
            No applications match your filters.
          </p>
        </div>
      )}

      {/* Detail Panel */}
      {currentSelected && (
        <DetailPanel
          application={currentSelected}
          open={!!currentSelected}
          onClose={() => setSelectedApplication(null)}
          onUpdate={updateApplication}
          onUpdateContact={updateContact}
          onUpdateNotes={updateNotes}
          onUpdateJobDescription={updateJobDescription}
        />
      )}
    </div>
  )
}
