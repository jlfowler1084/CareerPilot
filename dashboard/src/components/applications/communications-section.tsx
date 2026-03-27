"use client"

import { useState } from "react"
import { formatDistanceToNow, format } from "date-fns"
import {
  ChevronDown,
  ChevronRight,
  Mail,
  Loader2,
  ExternalLink,
  Send,
  Unlink,
  MessageSquare,
} from "lucide-react"
import { useCommunications, type GroupedThread } from "@/hooks/use-communications"
import { LinkEmailModal } from "@/components/applications/link-email-modal"
import { CategoryBadge } from "@/components/inbox/category-badge"
import type { Application, Email } from "@/types"

interface CommunicationsSectionProps {
  application: Application
}

const USER_EMAIL = "jlfowler1084@gmail.com"

export function CommunicationsSection({ application }: CommunicationsSectionProps) {
  const { threads, totalEmails, loading, error, unlinkEmail, refresh } = useCommunications(application.id)
  const [open, setOpen] = useState(totalEmails > 0)
  const [linkModalOpen, setLinkModalOpen] = useState(false)

  // Re-sync open state when data loads
  const [prevTotal, setPrevTotal] = useState<number | null>(null)
  if (totalEmails !== prevTotal) {
    setPrevTotal(totalEmails)
    if (totalEmails > 0 && !open) setOpen(true)
  }

  return (
    <div className="border-t border-zinc-100 mt-3 pt-3">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {open ? (
          <ChevronDown size={12} className="text-zinc-400" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400" />
        )}
        <Mail size={12} className="text-blue-500" />
        <span className="text-xs font-semibold text-zinc-500 group-hover:text-zinc-700">
          Communications
        </span>
        {totalEmails > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
            {totalEmails}
          </span>
        )}
      </button>

      {/* Content */}
      {open && (
        <div className="mt-2 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 py-3 justify-center">
              <Loader2 size={14} className="text-blue-500 animate-spin" />
              <span className="text-xs text-zinc-500">Loading emails...</span>
            </div>
          )}

          {error && !loading && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {error}
            </div>
          )}

          {!loading && !error && threads.length === 0 && (
            <div className="text-center py-4 space-y-2">
              <p className="text-xs text-zinc-400">No emails linked yet</p>
              <button
                type="button"
                onClick={() => setLinkModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Mail size={12} /> Link Email from Inbox
              </button>
            </div>
          )}

          {!loading && threads.map((thread) => (
            <ThreadCard
              key={thread.thread_id}
              thread={thread}
              onUnlink={unlinkEmail}
            />
          ))}

          {!loading && !error && threads.length > 0 && (
            <button
              type="button"
              onClick={() => setLinkModalOpen(true)}
              className="w-full text-center py-1.5 text-[10px] text-blue-500 hover:text-blue-700 transition-colors"
            >
              + Link another email
            </button>
          )}
        </div>
      )}

      <LinkEmailModal
        applicationId={application.id}
        companyName={application.company}
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        onLinked={refresh}
      />
    </div>
  )
}

function ThreadCard({
  thread,
  onUnlink,
}: {
  thread: GroupedThread
  onUnlink: (emailId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [fullThread, setFullThread] = useState<ThreadMessage[] | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null)

  const latest = thread.latest_email
  const hasReply = thread.emails.some((e) => e.replied_at)

  async function loadFullThread() {
    if (fullThread || !latest.thread_id) return
    setLoadingFull(true)
    try {
      const resp = await fetch("/api/gmail/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: latest.thread_id }),
      })
      const data = await resp.json()
      setFullThread(data.messages || [])
    } catch {
      // Silently fall back to Supabase preview data
    } finally {
      setLoadingFull(false)
    }
  }

  function handleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next) loadFullThread()
  }

  function handleUnlink(emailId: string) {
    if (confirmUnlink === emailId) {
      onUnlink(emailId)
      setConfirmUnlink(null)
    } else {
      setConfirmUnlink(emailId)
      setTimeout(() => setConfirmUnlink(null), 3000)
    }
  }

  const inboxUrl = `/inbox?select=${latest.id}`

  return (
    <div className="rounded-lg border border-zinc-100 overflow-hidden">
      {/* Thread summary row */}
      <button
        type="button"
        onClick={handleExpand}
        className="flex items-start gap-2 w-full text-left px-3 py-2.5 hover:bg-zinc-50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={10} className="text-zinc-400 mt-0.5 flex-shrink-0" />
        ) : (
          <ChevronRight size={10} className="text-zinc-400 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium text-zinc-700 truncate">
              {latest.from_name || latest.from_email}
            </span>
            <span className="text-[10px] text-zinc-400 flex-shrink-0">
              {formatDistanceToNow(new Date(latest.received_at), { addSuffix: true })}
            </span>
          </div>
          <div className="text-xs font-semibold text-zinc-800 truncate mb-0.5">
            {latest.subject || "(no subject)"}
          </div>
          <div className="text-[11px] text-zinc-400 truncate">
            {latest.body_preview?.slice(0, 100) || ""}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <CategoryBadge category={latest.category} />
            {thread.message_count > 1 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 flex items-center gap-0.5">
                <MessageSquare size={9} /> {thread.message_count}
              </span>
            )}
            {hasReply && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-600">
                Replied
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded thread detail */}
      {expanded && (
        <div className="border-t border-zinc-100 px-3 py-2 space-y-2 bg-zinc-50/50">
          {loadingFull && (
            <div className="flex items-center gap-2 py-2 justify-center">
              <Loader2 size={12} className="text-zinc-400 animate-spin" />
              <span className="text-[10px] text-zinc-400">Loading full thread...</span>
            </div>
          )}

          {/* Messages — use full thread if loaded, otherwise Supabase previews */}
          {(fullThread || thread.emails.map(emailToThreadMsg)).map((msg, i) => {
            const isUser = msg.from_email.toLowerCase() === USER_EMAIL.toLowerCase()
            return (
              <div
                key={msg.gmail_id || i}
                className={`rounded border p-2 ${
                  isUser
                    ? "border-blue-200 bg-blue-50/40 ml-4"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-medium ${isUser ? "text-blue-600" : "text-zinc-600"}`}>
                    {isUser ? "You" : msg.from_name || msg.from_email}
                  </span>
                  <span className="text-[9px] text-zinc-400">
                    {format(new Date(msg.date), "MMM d, h:mm a")}
                  </span>
                </div>
                <pre className="text-[11px] text-zinc-600 whitespace-pre-wrap font-sans leading-relaxed">
                  {msg.body || "(empty)"}
                </pre>
              </div>
            )
          })}

          {/* Quick actions */}
          <div className="flex items-center gap-3 pt-1">
            <a
              href={inboxUrl}
              className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700"
            >
              <ExternalLink size={10} /> Open in Inbox
            </a>
            <a
              href={`${inboxUrl}&reply=1`}
              className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800"
            >
              <Send size={10} /> Draft Reply
            </a>
            {thread.emails.map((email) => (
              <button
                key={email.id}
                type="button"
                onClick={() => handleUnlink(email.id)}
                className={`flex items-center gap-1 text-[10px] transition-colors ${
                  confirmUnlink === email.id
                    ? "text-red-600 font-semibold"
                    : "text-zinc-400 hover:text-red-500"
                }`}
              >
                <Unlink size={10} />
                {confirmUnlink === email.id ? "Confirm?" : thread.emails.length > 1 ? `Unlink (${thread.emails.indexOf(email) + 1})` : "Unlink"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface ThreadMessage {
  gmail_id: string
  from_email: string
  from_name: string | null
  to_email: string | null
  subject: string | null
  date: string
  body: string
}

function emailToThreadMsg(email: Email): ThreadMessage {
  return {
    gmail_id: email.gmail_id,
    from_email: email.from_email,
    from_name: email.from_name,
    to_email: email.to_email,
    subject: email.subject,
    date: email.received_at,
    body: email.body_preview || "",
  }
}
