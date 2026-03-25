"use client"

import { useMemo } from "react"
import { EmailCard } from "./email-card"
import { BulkActions } from "./bulk-actions"
import type { Email, EmailApplicationLink, Application, EmailCategory } from "@/types"

interface EmailListProps {
  emails: Email[]
  links: EmailApplicationLink[]
  applications: Pick<Application, "id" | "company" | "title" | "status">[]
  selectedEmailId: string | null
  checkedIds: Set<string>
  filter: string
  showDismissed: boolean
  onSelect: (id: string) => void
  onCheck: (id: string, checked: boolean) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onDismissMany: (ids: string[]) => void
  onLinkMany: (ids: string[], appId: string) => void
}

const FILTER_CATEGORIES: Record<string, EmailCategory[]> = {
  recruiter: ["recruiter_outreach"],
  interview: ["interview_request"],
  follow_up: ["follow_up"],
  offers: ["offer"],
  alerts: ["job_alert"],
  rejected: ["rejection"],
}

export function EmailList({
  emails, links, applications, selectedEmailId, checkedIds, filter, showDismissed,
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

  const filtered = useMemo(() => {
    let list = showDismissed ? emails : emails.filter((e) => !e.dismissed)

    if (filter === "unlinked") {
      list = list.filter((e) => !linkedEmailIds.has(e.id))
    } else if (FILTER_CATEGORIES[filter]) {
      list = list.filter((e) => FILTER_CATEGORIES[filter].includes(e.category))
    }

    return list
  }, [emails, filter, showDismissed, linkedEmailIds])

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
        ) : (
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
