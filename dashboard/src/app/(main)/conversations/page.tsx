"use client"

import { useState, useMemo } from "react"
import { useConversations, useConversationPatterns } from "@/hooks/use-conversations"
import { ConversationList } from "@/components/conversations/conversation-list"
import { ConversationFormModal } from "@/components/conversations/conversation-form-modal"
import { PatternInsights } from "@/components/conversations/pattern-insights"
import { CONVERSATION_TYPES } from "@/lib/constants"
import { Search, Sparkles, Plus } from "lucide-react"
import { toast } from "sonner"
import type { Conversation, ConversationType } from "@/types"

export default function ConversationsPage() {
  const { conversations, loading, addConversation, updateConversation, deleteConversation } =
    useConversations()
  const { patterns, loading: patternsLoading, error: patternsError, fetchPatterns } =
    useConversationPatterns()

  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<ConversationType | null>(null)
  const [showPatterns, setShowPatterns] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingConversation, setEditingConversation] = useState<Conversation | null>(null)

  async function handleSave(data: Record<string, unknown>) {
    const result = await addConversation(data)
    if (result.error) {
      toast.error(result.error)
      return { data: null, error: result.error }
    }
    toast.success("Conversation logged — analyzing...")
    return { data: result.data, error: null }
  }

  async function handleUpdate(id: string, data: Record<string, unknown>) {
    const result = await updateConversation(id, data)
    if (result.error) {
      toast.error(result.error)
      return { data: null, error: result.error }
    }
    toast.success("Conversation updated — re-analyzing...")
    return { data: result.data, error: null }
  }

  function handleEdit(conversation: Conversation) {
    setEditingConversation(conversation)
    setFormOpen(true)
  }

  function handleFormOpenChange(open: boolean) {
    setFormOpen(open)
    if (!open) setEditingConversation(null)
  }

  const filtered = useMemo(() => {
    let list = [...conversations]

    if (typeFilter) {
      list = list.filter((c) => c.conversation_type === typeFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (c) =>
          (c.title && c.title.toLowerCase().includes(q)) ||
          (c.notes && c.notes.toLowerCase().includes(q)) ||
          (c.application?.company &&
            c.application.company.toLowerCase().includes(q)) ||
          (c.topics && c.topics.some((t) => t.toLowerCase().includes(q)))
      )
    }

    return list
  }, [conversations, typeFilter, searchQuery])

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-bold mb-6">Conversations</h2>
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Conversations</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowPatterns(!showPatterns)
              if (!showPatterns && !patterns) fetchPatterns()
            }}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              showPatterns
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "border-zinc-200 text-zinc-500 hover:text-amber-600 hover:border-amber-300"
            }`}
          >
            <Sparkles size={12} />
            Patterns
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingConversation(null)
              setFormOpen(true)
            }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-amber-500 border-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            <Plus size={12} />
            Add Conversation
          </button>
        </div>
      </div>

      {/* Pattern Insights Panel */}
      {showPatterns && (
        <PatternInsights
          patterns={patterns}
          loading={patternsLoading}
          error={patternsError}
          onFetch={fetchPatterns}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations, companies, topics..."
            className="w-full text-sm border border-zinc-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setTypeFilter(null)}
            className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
              !typeFilter
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
            }`}
          >
            All
          </button>
          {CONVERSATION_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() =>
                setTypeFilter(typeFilter === t.id ? null : t.id)
              }
              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                typeFilter === t.id
                  ? "bg-amber-50 border-amber-300 text-amber-700"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-400 ml-auto">
          {filtered.length} of {conversations.length}
        </span>
      </div>

      {/* Conversation List */}
      {filtered.length > 0 ? (
        <ConversationList
          conversations={filtered}
          onDelete={deleteConversation}
          onEdit={handleEdit}
          showCompany
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
          <p className="text-sm text-zinc-500">
            {conversations.length === 0
              ? "No conversations logged yet. Click \"Add Conversation\" to log your first one."
              : "No conversations match your filters."}
          </p>
        </div>
      )}

      {/* Form Modal */}
      <ConversationFormModal
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        onSave={handleSave}
        onUpdate={handleUpdate}
        conversation={editingConversation}
      />
    </div>
  )
}
