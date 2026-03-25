"use client"

import { useState } from "react"
import { CONVERSATION_TYPES } from "@/lib/constants"
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react"
import type { Conversation } from "@/types"

interface ConversationListProps {
  conversations: Conversation[]
  onDelete: (id: string) => Promise<void>
  showCompany?: boolean
}

function typeIcon(type: string): string {
  return CONVERSATION_TYPES.find((t) => t.id === type)?.icon || "\u{1F4AC}"
}

function typeLabel(type: string): string {
  return CONVERSATION_TYPES.find((t) => t.id === type)?.label || type
}

function sentimentStars(n: number | null): string {
  if (!n) return ""
  return "\u2B50".repeat(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function ConversationList({
  conversations,
  onDelete,
  showCompany = false,
}: ConversationListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id)
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      setTimeout(() => setConfirmDeleteId(null), 3000)
      return
    }
    await onDelete(id)
    setConfirmDeleteId(null)
  }

  if (conversations.length === 0) {
    return (
      <p className="text-xs text-zinc-400 py-3 text-center">
        No conversations logged yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {conversations.map((c) => {
        const expanded = expandedId === c.id
        return (
          <div
            key={c.id}
            className="bg-white border border-zinc-200 rounded-lg overflow-hidden"
          >
            {/* Summary row */}
            <button
              onClick={() => toggleExpand(c.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
            >
              <span className="text-base flex-shrink-0">
                {typeIcon(c.conversation_type)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-900 truncate">
                    {c.title || typeLabel(c.conversation_type)}
                  </span>
                  {showCompany && c.application && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-500">
                      {c.application.company}
                    </span>
                  )}
                  {c.sentiment && (
                    <span className="text-xs">{sentimentStars(c.sentiment)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-zinc-400">
                    {formatDate(c.date)}
                  </span>
                  {c.duration_minutes && (
                    <span className="text-[10px] text-zinc-400">
                      {c.duration_minutes}min
                    </span>
                  )}
                  {c.topics && c.topics.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {c.topics.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                        >
                          {t}
                        </span>
                      ))}
                      {c.topics.length > 3 && (
                        <span className="text-[9px] text-zinc-400">
                          +{c.topics.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {expanded ? (
                <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-zinc-400 flex-shrink-0" />
              )}
            </button>

            {/* Expanded details */}
            {expanded && (
              <div className="px-3 pb-3 border-t border-zinc-100 space-y-3 pt-3">
                {/* People */}
                {c.people && c.people.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">
                      People
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {c.people.map((p, i) => (
                        <span
                          key={i}
                          className="text-xs bg-zinc-50 border border-zinc-200 rounded px-2 py-1"
                        >
                          {p.name}
                          {p.role ? ` (${p.role})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {c.notes && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">
                      Notes
                    </p>
                    <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                      {c.notes}
                    </p>
                  </div>
                )}

                {/* Questions Asked */}
                {c.questions_asked && c.questions_asked.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">
                      Questions They Asked
                    </p>
                    <div className="space-y-2">
                      {c.questions_asked.map((q, i) => (
                        <div
                          key={i}
                          className="bg-zinc-50 rounded p-2 border border-zinc-100"
                        >
                          <p className="text-xs font-semibold text-zinc-800">
                            Q: {q.question}
                          </p>
                          {q.your_answer && (
                            <p className="text-xs text-zinc-600 mt-1">
                              A: {q.your_answer}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Questions You Asked */}
                {c.questions_you_asked && c.questions_you_asked.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">
                      Questions You Asked
                    </p>
                    <div className="space-y-2">
                      {c.questions_you_asked.map((q, i) => (
                        <div
                          key={i}
                          className="bg-blue-50 rounded p-2 border border-blue-100"
                        >
                          <p className="text-xs font-semibold text-blue-800">
                            Q: {q.question}
                          </p>
                          {q.their_response && (
                            <p className="text-xs text-blue-600 mt-1">
                              A: {q.their_response}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Items */}
                {c.action_items && c.action_items.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">
                      Action Items
                    </p>
                    <div className="space-y-1">
                      {c.action_items.map((a, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span
                            className={`text-xs ${
                              a.completed
                                ? "line-through text-zinc-400"
                                : "text-zinc-700"
                            }`}
                          >
                            {a.completed ? "\u2611" : "\u2610"} {a.task}
                          </span>
                          {a.due_date && (
                            <span className="text-[10px] text-zinc-400">
                              due {a.due_date}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delete button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => handleDelete(c.id)}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                      confirmDeleteId === c.id
                        ? "bg-red-100 text-red-700 border border-red-300"
                        : "text-zinc-400 hover:text-red-500"
                    }`}
                  >
                    <Trash2 size={10} />
                    {confirmDeleteId === c.id ? "Confirm?" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
