"use client"

import { format, formatDistanceToNow } from "date-fns"
import { ExternalLink } from "lucide-react"
import { CategoryBadge } from "./category-badge"
import type { Email, EmailApplicationLink, Application } from "@/types"

interface EmailDetailProps {
  email: Email
  links: EmailApplicationLink[]
  applications: Pick<Application, "id" | "company" | "title" | "status">[]
  onLink: (emailId: string, appId: string, linkedBy: "manual" | "confirmed_suggestion") => void
  onUnlink: (emailId: string, appId: string) => void
  onDismiss: (emailId: string) => void
  onUndismiss: (emailId: string) => void
}

export function EmailDetail({
  email, links, applications, onLink, onUnlink, onDismiss, onUndismiss,
}: EmailDetailProps) {
  const emailLinks = links.filter((l) => l.email_id === email.id)
  const linkedAppIds = new Set(emailLinks.map((l) => l.application_id))
  const classification = email.classification_json
  const suggestion = email.suggested_application_id
  const suggestedApp = suggestion ? applications.find((a) => a.id === suggestion) : null

  const handleLink = (appId: string) => {
    const linkedBy = appId === suggestion ? "confirmed_suggestion" : "manual"
    onLink(email.id, appId, linkedBy as "manual" | "confirmed_suggestion")
  }

  const gmailUrl = email.thread_id
    ? `https://mail.google.com/mail/u/0/#inbox/${email.thread_id}`
    : `https://mail.google.com/mail/u/0/#inbox/${email.gmail_id}`

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
              {email.from_name && <span className="font-medium text-zinc-700 dark:text-zinc-300">{email.from_name}</span>}
              {" "}<span className="font-mono text-xs">&lt;{email.from_email}&gt;</span>
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
              {email.subject || "(no subject)"}
            </h3>
          </div>
          <CategoryBadge category={email.category} />
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
          <span>{format(new Date(email.received_at), "MMM d, yyyy h:mm a")}</span>
          <span>({formatDistanceToNow(new Date(email.received_at), { addSuffix: true })})</span>
        </div>
        {classification && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {classification.company && (
              <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {classification.company}
              </span>
            )}
            {classification.role && (
              <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {classification.role}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded ${
              classification.urgency === "high" ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
              classification.urgency === "medium" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
              "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            }`}>
              {classification.urgency} urgency
            </span>
          </div>
        )}
        {classification?.summary && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 italic">
            {classification.summary}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
          {email.body_preview || "No preview available."}
        </pre>
      </div>

      {/* Linking Section */}
      <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
        {/* Linked applications */}
        {emailLinks.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Linked to:</span>
            {emailLinks.map((link) => {
              const app = applications.find((a) => a.id === link.application_id)
              return app ? (
                <div key={link.application_id} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 rounded px-2.5 py-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {app.title} @ {app.company}
                  </span>
                  <button onClick={() => onUnlink(email.id, link.application_id)} className="text-[10px] text-red-500 hover:underline">
                    Unlink
                  </button>
                </div>
              ) : null
            })}
          </div>
        )}

        {/* Suggestion or dropdown */}
        {emailLinks.length === 0 && (
          <div className="flex items-center gap-2">
            <select
              defaultValue={suggestion || ""}
              onChange={(e) => { if (e.target.value) handleLink(e.target.value) }}
              className="flex-1 text-sm px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">Link to application...</option>
              {applications
                .filter((a) => !linkedAppIds.has(a.id))
                .map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.title} @ {app.company}
                  </option>
                ))}
            </select>
            {suggestedApp && (
              <span className="text-[10px] text-blue-500 dark:text-blue-400 flex-shrink-0">
                Suggested
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {email.dismissed ? (
            <button onClick={() => onUndismiss(email.id)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              Restore to inbox
            </button>
          ) : (
            <button onClick={() => onDismiss(email.id)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              Dismiss
            </button>
          )}
          <a
            href={gmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400"
          >
            Open in Gmail <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}
