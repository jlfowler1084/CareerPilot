"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { EmailCard } from "./email-card"
import { BulkActions } from "./bulk-actions"
import type { Email, EmailApplicationLink, Application, EmailCategory } from "@/types"

interface EmailListProps {
  emails: Email[]
  links: EmailApplicationLink[]
  applications: Pick<Application, "id" | "company" | "title" | "status">[]
  selectedEmailId: string | null
  checkedIds: Set<string>
  excludedFilters: Set<string>
  showUnlinkedOnly: boolean
  showDismissed: boolean
  sortOrder: "newest" | "oldest"
  hideSubs: boolean
  groupByCompany: boolean
  onSelect: (id: string) => void
  onCheck: (id: string, checked: boolean) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onDismissMany: (ids: string[]) => void
  onLinkMany: (ids: string[], appId: string) => void
}

// ── Subscription detection ───────────────────────────

const SUB_FROM_PATTERNS = /noreply|no-reply|notifications|updates|newsletter|digest|mailer|marketing/i
const SUB_DOMAINS = new Set([
  "linkedin.com", "indeed.com", "glassdoor.com", "dice.com",
  "ziprecruiter.com", "monster.com", "notifications.indeed.com",
])
const SUB_SUBJECT_PATTERNS = /^(new job|jobs matching|job alert|daily digest|weekly update)/i

function isSubscription(email: Email): boolean {
  if (email.category === "job_alert" || email.category === "irrelevant") return true
  if (SUB_FROM_PATTERNS.test(email.from_email)) return true
  if (email.from_domain && SUB_DOMAINS.has(email.from_domain.toLowerCase())) return true
  if (email.body_preview && email.body_preview.toLowerCase().includes("unsubscribe")) return true
  if (email.subject && SUB_SUBJECT_PATTERNS.test(email.subject)) return true
  return false
}

// ── Company grouping helpers ─────────────────────────

const DOMAIN_PREFIXES = /^(mail|hr|recruiting|careers|talent)\./i

function formatDomain(domain: string): string {
  const cleaned = domain.replace(DOMAIN_PREFIXES, "")
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function groupByDomain(emails: Email[]): { domain: string; emails: Email[] }[] {
  const map = new Map<string, Email[]>()
  for (const e of emails) {
    const domain = (e.from_domain || "unknown").toLowerCase().replace(DOMAIN_PREFIXES, "")
    if (!map.has(domain)) map.set(domain, [])
    map.get(domain)!.push(e)
  }
  return [...map.entries()]
    .map(([domain, emails]) => ({ domain, emails }))
    .sort((a, b) => {
      const aMax = Math.max(...a.emails.map((e) => new Date(e.received_at).getTime()))
      const bMax = Math.max(...b.emails.map((e) => new Date(e.received_at).getTime()))
      return bMax - aMax
    })
}

const FILTER_CATEGORIES: Record<string, EmailCategory[]> = {
  recruiter: ["recruiter_outreach"],
  interview: ["interview_request"],
  follow_up: ["follow_up"],
  offers: ["offer"],
  alerts: ["job_alert"],
  rejected: ["rejection"],
  irrelevant: ["irrelevant"],
}

export function EmailList({
  emails, links, applications, selectedEmailId, checkedIds, excludedFilters, showUnlinkedOnly, showDismissed,
  sortOrder, hideSubs, groupByCompany,
  onSelect, onCheck, onSelectAll, onDeselectAll, onDismissMany, onLinkMany,
}: EmailListProps) {
  const linkedEmailIds = useMemo(() => {
    const map = new Map<string, string>()
    links.forEach((l) => map.set(l.email_id, l.application_id))
    return map
  }, [links])

  const appMap = useMemo(() => {
    const map = new Map<string, (typeof applications)[number]>()
    applications.forEach((a) => map.set(a.id, a))
    return map
  }, [applications])

  // Build set of excluded email categories from excluded filter IDs
  const excludedCategories = useMemo(() => {
    const cats = new Set<EmailCategory>()
    excludedFilters.forEach((filterId) => {
      const mapping = FILTER_CATEGORIES[filterId]
      if (mapping) mapping.forEach((c) => cats.add(c))
    })
    return cats
  }, [excludedFilters])

  const filtered = useMemo(() => {
    let list = showDismissed ? emails : emails.filter((e) => !e.dismissed)

    // Apply category exclusions
    if (excludedCategories.size > 0) {
      list = list.filter((e) => !excludedCategories.has(e.category))
    }

    // Apply unlinked filter
    if (showUnlinkedOnly) {
      list = list.filter((e) => !linkedEmailIds.has(e.id))
    }

    // Apply subscription filter
    if (hideSubs) {
      list = list.filter((e) => !isSubscription(e))
    }

    // Apply sort
    list = [...list].sort((a, b) => {
      const aTime = new Date(a.received_at).getTime()
      const bTime = new Date(b.received_at).getTime()
      return sortOrder === "newest" ? bTime - aTime : aTime - bTime
    })

    return list
  }, [emails, excludedCategories, showUnlinkedOnly, showDismissed, linkedEmailIds, hideSubs, sortOrder])

  // Company groups (only computed when groupByCompany is on)
  const groups = useMemo(
    () => groupByCompany ? groupByDomain(filtered) : [],
    [filtered, groupByCompany]
  )

  // Collapsed group state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  function toggleGroup(domain: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      <BulkActions
        selectedCount={checkedIds.size}
        applications={applications}
        onDismiss={() => onDismissMany(Array.from(checkedIds))}
        onLink={(appId) => onLinkMany(Array.from(checkedIds), appId)}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
      />
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500 py-12">
            <span className="text-3xl mb-2">All caught up</span>
            <span className="text-sm">No emails match this filter</span>
          </div>
        ) : groupByCompany ? (
          /* Company-grouped view */
          groups.map((group) => {
            const collapsed = collapsedGroups.has(group.domain)
            // Find linked application for this domain group
            const groupAppNames = new Set<string>()
            for (const e of group.emails) {
              const appId = linkedEmailIds.get(e.id)
              if (appId) {
                const app = appMap.get(appId)
                if (app) groupAppNames.add(app.company)
              }
            }
            return (
              <div key={group.domain}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.domain)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {collapsed ? <ChevronRight size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {formatDomain(group.domain)}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {group.emails.length} email{group.emails.length !== 1 ? "s" : ""}
                  </span>
                  {groupAppNames.size > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ml-auto">
                      {[...groupAppNames].join(", ")}
                    </span>
                  )}
                </button>
                {!collapsed && group.emails.map((email) => {
                  const linkedAppId = linkedEmailIds.get(email.id)
                  const linkedApp = linkedAppId ? appMap.get(linkedAppId) || null : null
                  return (
                    <EmailCard
                      key={email.id}
                      email={email}
                      isSelected={selectedEmailId === email.id}
                      isChecked={checkedIds.has(email.id)}
                      onSelect={() => onSelect(email.id)}
                      onCheck={(checked) => onCheck(email.id, checked)}
                      linkedApp={linkedApp as Application | null}
                      hasSuggestion={!!email.suggested_application_id}
                    />
                  )
                })}
              </div>
            )
          })
        ) : (
          /* Flat view */
          filtered.map((email) => {
            const linkedAppId = linkedEmailIds.get(email.id)
            const linkedApp = linkedAppId ? appMap.get(linkedAppId) || null : null
            return (
              <EmailCard
                key={email.id}
                email={email}
                isSelected={selectedEmailId === email.id}
                isChecked={checkedIds.has(email.id)}
                onSelect={() => onSelect(email.id)}
                onCheck={(checked) => onCheck(email.id, checked)}
                linkedApp={linkedApp as Application | null}
                hasSuggestion={!!email.suggested_application_id}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
