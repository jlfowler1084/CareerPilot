"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { RefreshCw, Mail, ArrowLeft, X, Zap } from "lucide-react"
import { useEmails } from "@/hooks/use-emails"
import { FilterChips, ALL_FILTER_IDS } from "@/components/inbox/filter-chips"
import { EmailList } from "@/components/inbox/email-list"
import { EmailDetail } from "@/components/inbox/email-detail"
import { EmptyState } from "@/components/shared/empty-state"
import { InboxQuickFiltersBar } from "@/components/inbox/inbox-quick-filters"
import { InboxAdvancedFiltersPanel } from "@/components/inbox/inbox-advanced-filters"
import { InboxQueryMode, InboxQueryModeToggle } from "@/components/inbox/inbox-query-mode"
import {
  type InboxQuickFilters,
  type InboxAdvancedFilters,
  DEFAULT_INBOX_QUICK_FILTERS,
  DEFAULT_INBOX_ADVANCED_FILTERS,
  applyInboxQuickFilters,
  applyInboxAdvancedFilters,
  hasActiveInboxQuickFilters,
  hasActiveInboxAdvancedFilters,
} from "@/lib/inbox-filter-utils"
import { parseInboxQuery, applyInboxQueryFilter } from "@/lib/inbox-query-parser"

const CONVERSATIONS_EXCLUDED = new Set(["alerts", "irrelevant"])

const INBOX_SORT_KEY = "careerpilot_inbox_sort"
const INBOX_HIDE_SUBS_KEY = "careerpilot_inbox_hide_subs"
const INBOX_GROUP_KEY = "careerpilot_inbox_group_by_company"

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function savePref(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export default function InboxPage() {
  const {
    emails, links, applications, loading, scanState,
    linkEmail, unlinkEmail, dismissEmail, undismissEmail, dismissMany, linkMany, markRead, markReplied, refresh, backfillAutoTrack,
  } = useEmails()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [excludedFilters, setExcludedFilters] = useState<Set<string>>(new Set(["alerts"]))
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">(() => loadPref(INBOX_SORT_KEY, "newest"))
  const [hideSubs, setHideSubs] = useState<boolean>(() => loadPref(INBOX_HIDE_SUBS_KEY, false))
  const [groupByCompany, setGroupByCompany] = useState<boolean>(() => loadPref(INBOX_GROUP_KEY, false))

  // CAR-77: Advanced filtering state
  const [quickFilters, setQuickFilters] = useState<InboxQuickFilters>(DEFAULT_INBOX_QUICK_FILTERS)
  const [advancedFilters, setAdvancedFilters] = useState<InboxAdvancedFilters>(DEFAULT_INBOX_ADVANCED_FILTERS)
  const [queryMode, setQueryMode] = useState(false)
  const [queryString, setQueryString] = useState("")

  // Compute linked email IDs for filter functions
  const linkedEmailIds = useMemo(() => {
    const set = new Set<string>()
    links.forEach((l) => set.add(l.email_id))
    return set
  }, [links])

  // CAR-77: Filter pipeline — apply new filters before passing to EmailList
  const pipelineFiltered = useMemo(() => {
    if (queryMode) {
      const parsed = parseInboxQuery(queryString)
      return applyInboxQueryFilter(emails, parsed, linkedEmailIds)
    }
    let result = applyInboxQuickFilters(emails, quickFilters, linkedEmailIds)
    result = applyInboxAdvancedFilters(result, advancedFilters)
    return result
  }, [emails, queryMode, queryString, quickFilters, advancedFilters, linkedEmailIds])

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

  const [autoTrackBanner, setAutoTrackBanner] = useState<string | null>(null)

  // CAR-79: Backfill state
  const [backfillState, setBackfillState] = useState<{
    scanning: boolean; current: number; total: number; found: number
  } | null>(null)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)

  const unprocessedCount = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const linkedIds = new Set(links.map((l) => l.email_id))
    return emails.filter((e) =>
      e.auto_track_status === null &&
      e.category !== "unclassified" &&
      !linkedIds.has(e.id) &&
      new Date(e.received_at) > sevenDaysAgo
    ).length
  }, [emails, links])

  const handleBackfill = useCallback(async () => {
    setBackfillState({ scanning: true, current: 0, total: 0, found: 0 })
    setBackfillResult(null)
    try {
      const found = await backfillAutoTrack((current, total, found) => {
        setBackfillState({ scanning: true, current, total, found })
      })
      setBackfillState(null)
      if (found > 0) {
        setBackfillResult(`Found ${found} new application${found !== 1 ? "s" : ""}`)
      } else {
        setBackfillResult("All emails already scanned")
      }
      setTimeout(() => setBackfillResult(null), 5000)
    } catch {
      setBackfillState(null)
      setBackfillResult("Scan failed")
      setTimeout(() => setBackfillResult(null), 5000)
    }
  }, [backfillAutoTrack])

  // Check for newly auto-tracked emails and show banner
  useEffect(() => {
    const tracked = emails.filter((e) => e.auto_track_status === "tracked")
    if (tracked.length > 0 && !autoTrackBanner) {
      // Only show banner once per session
      const shown = sessionStorage.getItem("autotrack_banner_shown")
      if (!shown) {
        setAutoTrackBanner(`${tracked.length} application${tracked.length !== 1 ? "s" : ""} auto-tracked from email`)
        sessionStorage.setItem("autotrack_banner_shown", "1")
      }
    }
  }, [emails]) // eslint-disable-line react-hooks/exhaustive-deps

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

        {/* Sort / Subscription / Grouping controls */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <select
            value={sortOrder}
            onChange={(e) => {
              const v = e.target.value as "newest" | "oldest"
              setSortOrder(v)
              savePref(INBOX_SORT_KEY, v)
            }}
            title="Sort order"
            className="text-xs px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>

          <button
            type="button"
            onClick={() => { setHideSubs(!hideSubs); savePref(INBOX_HIDE_SUBS_KEY, !hideSubs) }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              hideSubs
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
            }`}
          >
            Hide Subscriptions
          </button>

          <button
            type="button"
            onClick={() => { setGroupByCompany(!groupByCompany); savePref(INBOX_GROUP_KEY, !groupByCompany) }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              groupByCompany
                ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
            }`}
          >
            Group by Company
          </button>

          {/* CAR-79: Scan for Applications button */}
          {backfillResult ? (
            <span className="px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {backfillResult}
            </span>
          ) : backfillState?.scanning ? (
            <span className="px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Zap size={12} className="animate-pulse" />
              Scanning {backfillState.current}/{backfillState.total} emails...
            </span>
          ) : unprocessedCount > 0 ? (
            <button
              type="button"
              onClick={handleBackfill}
              disabled={scanState.scanning || scanState.classifying}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all bg-zinc-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <Zap size={12} />
                Scan for Applications
              </span>
            </button>
          ) : null}
        </div>

        {/* CAR-77: Quick Filters / Advanced Filters / Query Mode */}
        {!queryMode ? (
          <div className="mt-3 space-y-2">
            <InboxQuickFiltersBar
              filters={quickFilters}
              onFiltersChange={setQuickFilters}
              totalCount={emails.length}
              filteredCount={pipelineFiltered.length}
            />
            <InboxAdvancedFiltersPanel
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
              emails={emails}
            />
            <InboxQueryModeToggle onClick={() => setQueryMode(true)} />
          </div>
        ) : (
          <div className="mt-3">
            <InboxQueryMode
              queryString={queryString}
              onQueryChange={setQueryString}
              onToggle={() => setQueryMode(false)}
              totalCount={emails.length}
              filteredCount={pipelineFiltered.length}
            />
          </div>
        )}
      </div>

      {/* Auto-track banner */}
      {autoTrackBanner && (
        <div className="flex items-center gap-2 px-6 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
          <span className="text-xs text-emerald-700 dark:text-emerald-400">{autoTrackBanner}</span>
          <a href="/applications" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            View Applications
          </a>
          <button
            type="button"
            title="Dismiss"
            onClick={() => setAutoTrackBanner(null)}
            className="ml-auto text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: email list */}
        <div className={`w-full md:w-[420px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-hidden ${selectedId ? "hidden md:block" : ""}`}>
          <EmailList
            emails={pipelineFiltered}
            links={links}
            applications={applications}
            selectedEmailId={selectedId}
            checkedIds={checkedIds}
            excludedFilters={excludedFilters}
            showUnlinkedOnly={showUnlinkedOnly}
            showDismissed={showDismissed}
            sortOrder={sortOrder}
            hideSubs={hideSubs}
            groupByCompany={groupByCompany}
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
