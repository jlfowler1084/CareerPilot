"use client"

import { useEffect, useState, useRef } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { ExternalLink, MessageSquare, Loader2, Send, RefreshCw, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { CategoryBadge } from "./category-badge"
import type { Email, EmailApplicationLink, Application } from "@/types"

const supabase = createClient()

const REPLY_CATEGORIES = new Set(["recruiter_outreach", "interview_request", "follow_up", "offer"])

interface ThreadMessage {
  gmail_id: string
  from_email: string
  from_name: string | null
  to_email: string | null
  subject: string | null
  date: string
  body: string
}

interface EmailDetailProps {
  email: Email
  links: EmailApplicationLink[]
  applications: Pick<Application, "id" | "company" | "title" | "status">[]
  onLink: (emailId: string, appId: string, linkedBy: "manual" | "confirmed_suggestion") => void
  onUnlink: (emailId: string, appId: string) => void
  onDismiss: (emailId: string) => void
  onUndismiss: (emailId: string) => void
  onEmailReplied: (emailId: string) => void
}

interface DraftState {
  to: string
  subject: string
  body: string
  inReplyTo: string
  references: string
}

export function EmailDetail({
  email, links, applications, onLink, onUnlink, onDismiss, onUndismiss, onEmailReplied,
}: EmailDetailProps) {
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const selectedRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentConfirm, setSentConfirm] = useState(false)

  const emailLinks = links.filter((l) => l.email_id === email.id)
  const linkedAppIds = new Set(emailLinks.map((l) => l.application_id))
  const classification = email.classification_json
  const suggestion = email.suggested_application_id
  const suggestedApp = suggestion ? applications.find((a) => a.id === suggestion) : null

  // Fetch thread when email changes
  useEffect(() => {
    if (!email.thread_id) {
      setThreadMessages([])
      return
    }

    let cancelled = false
    setThreadLoading(true)

    fetch("/api/gmail/thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: email.thread_id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setThreadMessages(data.messages || [])
          setThreadLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThreadMessages([])
          setThreadLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [email.id, email.thread_id])

  // Scroll to selected message in thread
  useEffect(() => {
    if (threadMessages.length > 1 && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [threadMessages])

  const handleLink = (appId: string) => {
    const linkedBy = appId === suggestion ? "confirmed_suggestion" : "manual"
    onLink(email.id, appId, linkedBy as "manual" | "confirmed_suggestion")
  }

  // Reset composer when email changes
  useEffect(() => {
    setDraft(null)
    setDrafting(false)
    setSending(false)
    setSentConfirm(false)
  }, [email.id])

  const handleDraftReply = async () => {
    if (!email.thread_id) return
    setDrafting(true)
    try {
      const resp = await fetch("/api/gmail/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: email.thread_id, emailId: email.gmail_id }),
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      setDraft({
        to: data.to,
        subject: data.suggestedSubject,
        body: data.draftBody,
        inReplyTo: data.inReplyTo,
        references: data.references,
      })
    } catch (err) {
      console.error("Draft reply error:", err)
    } finally {
      setDrafting(false)
    }
  }

  const handleSend = async () => {
    if (!draft || !email.thread_id) return
    setSending(true)
    try {
      const resp = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: email.thread_id,
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
          inReplyTo: draft.inReplyTo,
          references: draft.references,
        }),
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)

      // Update replied_at in Supabase
      await supabase.from("emails").update({ replied_at: new Date().toISOString() }).eq("id", email.id)
      onEmailReplied(email.id)

      setDraft(null)
      setSentConfirm(true)
      setTimeout(() => setSentConfirm(false), 3000)
    } catch (err) {
      console.error("Send error:", err)
    } finally {
      setSending(false)
    }
  }

  const handleRegenerate = async () => {
    const currentSubject = draft?.subject
    await handleDraftReply()
    // Preserve any subject edits
    if (currentSubject && draft) {
      setDraft((prev) => prev ? { ...prev, subject: currentSubject } : prev)
    }
  }

  const canReply = REPLY_CATEGORIES.has(email.category) && !!email.thread_id

  const gmailUrl = email.thread_id
    ? `https://mail.google.com/mail/u/0/#inbox/${email.thread_id}`
    : `https://mail.google.com/mail/u/0/#inbox/${email.gmail_id}`

  // Determine user's email from the to_email field of this (incoming) email
  const userEmail = (email.to_email || "").toLowerCase()

  const isUserMessage = (msg: ThreadMessage) =>
    msg.from_email.toLowerCase() === userEmail

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

      {/* Thread / Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {threadLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-4">
            <Loader2 size={14} className="animate-spin" />
            Loading thread...
          </div>
        ) : threadMessages.length > 1 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              <MessageSquare size={13} />
              Thread ({threadMessages.length} messages)
            </div>
            {threadMessages.map((msg) => {
              const isSelected = msg.gmail_id === email.gmail_id
              const isUser = isUserMessage(msg)
              return (
                <div
                  key={msg.gmail_id}
                  ref={isSelected ? selectedRef : undefined}
                  className={`rounded-lg border p-3 ${
                    isSelected
                      ? "border-amber-400/50 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-500/30"
                      : isUser
                      ? "border-blue-200 dark:border-blue-800/50 bg-blue-50/40 dark:bg-blue-900/10 ml-6"
                      : "border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs">
                      <span className={`font-medium ${isUser ? "text-blue-600 dark:text-blue-400" : "text-zinc-700 dark:text-zinc-300"}`}>
                        {isUser ? "You" : msg.from_name || msg.from_email}
                      </span>
                      {!isUser && msg.from_name && (
                        <span className="text-zinc-400 dark:text-zinc-500 font-mono ml-1 text-[10px]">
                          &lt;{msg.from_email}&gt;
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      {format(new Date(msg.date), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {msg.body || "(empty)"}
                  </pre>
                </div>
              )
            })}
          </div>
        ) : (
          <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
            {email.body_preview || "No preview available."}
          </pre>
        )}
      </div>

      {/* Reply Section */}
      {canReply && (
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
          {sentConfirm && (
            <div className="mb-2 text-sm font-medium text-green-600 dark:text-green-400">
              Sent!
            </div>
          )}

          {!draft && !drafting && (
            <button
              onClick={handleDraftReply}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              <Send size={14} />
              Draft Reply
            </button>
          )}

          {drafting && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 size={14} className="animate-spin" />
              Drafting reply...
            </div>
          )}

          {draft && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                To: <span className="font-mono">{draft.to}</span>
              </div>
              <input
                type="text"
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                placeholder="Subject"
                className="w-full text-sm px-3 py-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              />
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={8}
                placeholder="Reply body"
                className="w-full text-sm px-3 py-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 resize-y leading-relaxed"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !draft.body.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={drafting}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={13} />
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  <X size={13} />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
