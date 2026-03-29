"use client"

import { formatDistanceToNow } from "date-fns"
import { CategoryBadge } from "./category-badge"
import type { Email, EmailApplicationLink, Application } from "@/types"

interface EmailCardProps {
  email: Email
  isSelected: boolean
  isChecked: boolean
  onSelect: () => void
  onCheck: (checked: boolean) => void
  linkedApp: Application | null
  hasSuggestion: boolean
}

export function EmailCard({
  email, isSelected, isChecked, onSelect, onCheck, linkedApp, hasSuggestion,
}: EmailCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-start gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 cursor-pointer transition-all ${
        isSelected
          ? "bg-amber-50 dark:bg-amber-900/10 border-l-2 border-l-amber-500"
          : hasSuggestion && !linkedApp
          ? "border-l-2 border-l-dashed border-l-blue-400/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          : "border-l-2 border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      } ${!email.is_read ? "font-medium" : ""}`}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => { e.stopPropagation(); onCheck(e.target.checked) }}
        className="mt-1 rounded border-zinc-300 dark:border-zinc-600 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-sm truncate text-zinc-900 dark:text-zinc-100">
            {email.from_name || email.from_email}
          </span>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0 font-mono">
            {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
          </span>
        </div>
        <div className="text-sm truncate text-zinc-700 dark:text-zinc-300 mb-1">
          {email.subject || "(no subject)"}
        </div>
        <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate mb-1.5">
          {email.body_preview?.slice(0, 100) || ""}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryBadge category={email.category} />
          {email.replied_at && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
              Replied
            </span>
          )}
          {linkedApp && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              {linkedApp.title} @ {linkedApp.company}
            </span>
          )}
          {email.auto_track_status === "tracked" && !linkedApp && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              Auto-tracked &#x2713;
            </span>
          )}
          {email.auto_track_status === "prompted" && !linkedApp && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              Track this?
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
