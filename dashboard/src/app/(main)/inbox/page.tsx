"use client"

import { useState, useCallback, useMemo } from "react"
import { RefreshCw, Mail, ArrowLeft } from "lucide-react"
import { useEmails } from "@/hooks/use-emails"
import { FilterChips, ALL_FILTER_IDS } from "@/components/inbox/filter-chips"
import { EmailList } from "@/components/inbox/email-list"
import { EmailDetail } from "@/components/inbox/email-detail"
import { EmptyState } from "@/components/shared/empty-state"

const CONVERSATIONS_EXCLUDED = new Set(["alerts", "irrelevant"])

export default function InboxPage() {
  const {
    emails, links, applications, loading, scanState,
    linkEmail, unlinkEmail, dismissEmail, undismissEmail, dismissMany, linkMany, markRead, markReplied, refresh,
  } = useEmails()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [excludedFilters, setExcludedFilters] = useState<Set<string>>(new Set())
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedId) || null,
    [emails, selectedId]
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    markRead(id)
  }, [markRead])

  const handleCheck = useCallback((id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    const visible = showDismissed ? emails : emails.filter((e) => !e.dismissed)
    setCheckedIds(new Set(visible.map((e) => e.id)))
  }, [emails, showDismissed])

  const handleDeselectAll = useCallback(() => setCheckedIds(new Set()), [])

  const handleToggleFilter = useCallback((filterId: string) => {
    setExcludedFilters((prev) => {
      const next = new Set(prev)
      if (next.has(filterId)) next.delete(filterId)
      else next.add(filterId)
      return next
    })
  }, [])

  const handleShowAll = useCallback(() => {
    setExcludedFilters(new Set())
    setShowUnlinkedOnly(false)
  }, [])

  const handleConversations = useCallback(() => {
    setExcludedFilters(new Set(CONVERSATIONS_EXCLUDED))
    setShowUnlinkedOnly(false)
  }, [])

  const handleToggleUnlinked = useCallback(() => {
    setShowUnlinkedOnly((prev) => !prev)
  }, [])

  const handleDismissMany = useCallback((ids: string[]) => {
    dismissMany(ids)
    setCheckedIds(new Set())
  }, [dismissMany])

  const handleLinkMany = useCallback((ids: string[], appId: string) => {
    linkMany(ids, appId)
    setCheckedIds(new Set())
  }, [linkMany])

  if (loading) {
    return (
      <div className="flex flex-col h-full animate-pulse">
        <div className="px-6 py-4 border-b border-zinc-200">
          <div className="h-6 w-16 bg-zinc-100 rounded mb-2" />
          <div className="h-3 w-40 bg-zinc-100 rounded" />
        </div>
        <div className="flex flex-1">
          <div className="w-[420px] border-r border-zinc-200 p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-zinc-100 rounded-lg" />
            ))}
          </div>
          <div className="flex-1 p-6">
            <div className="h-6 w-48 bg-zinc-100 rounded mb-4" />
            <div className="space-y-2">
              <div className="h-4 bg-zinc-100 rounded w-full" />
              <div className="h-4 bg-zinc-100 rounded w-3/4" />
              <div className="h-4 bg-zinc-100 rounded w-1/2" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const statusText = scanState.classifying
    ? `Classifying ${scanState.classified} of ${scanState.total} emails...`
    : scanState.scanning
    ? "Scanning Gmail..."
    : scanState.lastScan
    ? `Last scanned ${new Date(scanState.lastScan).toLocaleTimeString()}`
    : "Not yet scanned"

  if (emails.length === 0 && !scanState.scanning && !scanState.classifying) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Inbox</h1>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <RefreshCw size={13} />
            Scan Gmail
          </button>
        </div>
        <EmptyState
          icon={Mail}
          title="No emails found"
          description="Scan your Gmail inbox to find recruiter emails, or check back after connecting Gmail."
          actions={[{ label: "Scan Now", onClick: refresh }]}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Inbox</h1>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono flex items-center gap-2">
              {(scanState.scanning || scanState.classifying) && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
              {statusText}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={(e) => setShowDismissed(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              Show dismissed
            </label>
            <button
              onClick={refresh}
              disabled={scanState.scanning || scanState.classifying}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} className={scanState.scanning ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
        <FilterChips
          emails={emails}
          links={links}
          excludedFilters={excludedFilters}
          showUnlinkedOnly={showUnlinkedOnly}
          onToggleFilter={handleToggleFilter}
          onShowAll={handleShowAll}
          onConversations={handleConversations}
          onToggleUnlinked={handleToggleUnlinked}
          showDismissed={showDismissed}
        />
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: email list */}
        <div className={`w-full md:w-[420px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-hidden ${selectedId ? "hidden md:block" : ""}`}>
          <EmailList
            emails={emails}
            links={links}
            applications={applications}
            selectedEmailId={selectedId}
            checkedIds={checkedIds}
            excludedFilters={excludedFilters}
            showUnlinkedOnly={showUnlinkedOnly}
            showDismissed={showDismissed}
            onSelect={handleSelect}
            onCheck={handleCheck}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onDismissMany={handleDismissMany}
            onLinkMany={handleLinkMany}
          />
        </div>

        {/* Right: detail panel */}
        <div className={`flex-1 overflow-hidden ${!selectedId ? "hidden md:block" : ""}`}>
          {selectedEmail ? (
            <div className="h-full flex flex-col">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="md:hidden flex items-center gap-1.5 px-4 py-3 text-xs font-medium text-zinc-600 border-b border-zinc-200 min-h-[44px]"
              >
                <ArrowLeft size={14} />
                Back to list
              </button>
              <div className="flex-1 overflow-hidden">
                <EmailDetail
                  email={selectedEmail}
                  links={links}
                  applications={applications}
                  onLink={linkEmail}
                  onUnlink={unlinkEmail}
                  onDismiss={dismissEmail}
                  onUndismiss={undismissEmail}
                  onEmailReplied={markReplied}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500">
              <span className="text-3xl mb-2">Select an email</span>
              <span className="text-sm">Click an email to view details and link to applications</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
