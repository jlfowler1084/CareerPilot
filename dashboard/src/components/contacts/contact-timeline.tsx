"use client"

import { useMemo } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Mail,
  Phone,
  Video,
  MessageSquare,
  Users,
  FileText,
} from "lucide-react"
import type { Email, Conversation, ConversationType } from "@/types"

interface ContactTimelineProps {
  emails: Email[]
  conversations: Conversation[]
}

type TimelineEntry =
  | { type: "email"; date: string; data: Email }
  | { type: "conversation"; date: string; data: Conversation }

function getConversationIcon(conversationType: ConversationType) {
  switch (conversationType) {
    case "phone":
      return Phone
    case "video":
      return Video
    case "chat":
      return MessageSquare
    case "in_person":
      return Users
    case "note":
      return FileText
    case "email":
      return Mail
    default:
      return MessageSquare
  }
}

function getConversationLabel(conversationType: ConversationType): string {
  switch (conversationType) {
    case "phone":
      return "Phone call"
    case "video":
      return "Video call"
    case "chat":
      return "Chat"
    case "in_person":
      return "In person"
    case "note":
      return "Note"
    case "email":
      return "Email"
    default:
      return "Conversation"
  }
}

function timeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

export function ContactTimeline({ emails, conversations }: ContactTimelineProps) {
  const entries = useMemo<TimelineEntry[]>(() => {
    const emailEntries: TimelineEntry[] = emails.map((e) => ({
      type: "email",
      date: e.received_at,
      data: e,
    }))
    const convEntries: TimelineEntry[] = conversations.map((c) => ({
      type: "conversation",
      date: c.date,
      data: c,
    }))
    return [...emailEntries, ...convEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [emails, conversations])

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">Interaction History</h2>
        <div className="text-center py-8">
          <MessageSquare size={28} className="text-zinc-200 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 max-w-xs mx-auto">
            No interactions recorded yet. Conversations logged via the Conversations form will
            appear here automatically.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6">
      <h2 className="text-sm font-semibold text-zinc-700 mb-4">
        Interaction History
        <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
          {entries.length}
        </span>
      </h2>

      <div className="space-y-3">
        {entries.map((entry, index) => {
          if (entry.type === "email") {
            const email = entry.data
            return (
              <div
                key={`email-${email.id}`}
                className="flex items-start gap-3 p-3 rounded-lg border border-zinc-100 hover:bg-zinc-50 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mail size={13} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-700 truncate">
                    {email.subject || "(no subject)"}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                    {email.from_name || email.from_email}
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {timeAgo(entry.date)}
                  </p>
                </div>
              </div>
            )
          }

          // conversation entry
          const conv = entry.data
          const Icon = getConversationIcon(conv.conversation_type)
          return (
            <div
              key={`conv-${conv.id}`}
              className="flex items-start gap-3 p-3 rounded-lg border border-zinc-100 hover:bg-zinc-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-violet-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon size={13} className="text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-700 truncate">
                  {conv.title || getConversationLabel(conv.conversation_type)}
                </p>
                {conv.notes && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">
                    {conv.notes.slice(0, 100)}
                    {conv.notes.length > 100 ? "\u2026" : ""}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {getConversationLabel(conv.conversation_type)} \u00B7 {timeAgo(entry.date)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
