"use client"

import { useState } from "react"
import { useConversations } from "@/hooks/use-conversations"
import { ConversationList } from "@/components/conversations/conversation-list"
import { ConversationForm } from "@/components/conversations/conversation-form"
import { ChevronDown, ChevronRight, Plus, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import type { Application } from "@/types"

interface ConversationSectionProps {
  application: Application
}

export function ConversationSection({ application }: ConversationSectionProps) {
  const { conversations, loading, addConversation, deleteConversation } =
    useConversations(application.id)
  const [open, setOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  // Quick-add banner: if interview_date is in the past and no conversation logged for that date
  const showQuickAdd =
    application.interview_date &&
    new Date(application.interview_date) < new Date() &&
    !conversations.some((c) => {
      const cDate = new Date(c.date).toDateString()
      const iDate = new Date(application.interview_date!).toDateString()
      return cDate === iDate
    })

  async function handleSave(data: Record<string, unknown>) {
    const result = await addConversation(data)
    if (result.error) {
      toast.error(result.error)
      return { error: result.error }
    }
    toast.success("Conversation logged")
    return { error: null }
  }

  async function handleDelete(id: string) {
    await deleteConversation(id)
    toast.success("Conversation removed")
  }

  return (
    <div className="border-t border-zinc-100 mt-3 pt-3">
      {/* Quick-add banner */}
      {showQuickAdd && !formOpen && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 flex items-center justify-between">
          <p className="text-xs text-amber-800">
            Log your conversation with {application.company}?
          </p>
          <button
            onClick={() => {
              setFormOpen(true)
            }}
            className="text-[10px] font-bold text-amber-700 hover:text-amber-900 px-2 py-1 bg-amber-100 rounded"
          >
            Log it
          </button>
        </div>
      )}

      {/* Collapsible header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {open ? (
          <ChevronDown size={12} className="text-zinc-400" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400" />
        )}
        <MessageSquare size={12} className="text-zinc-400" />
        <span className="text-xs font-semibold text-zinc-500 group-hover:text-zinc-700">
          Conversations
        </span>
        {conversations.length > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
            {conversations.length}
          </span>
        )}
        <span className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation()
            setFormOpen(true)
          }}
          className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Plus size={10} /> Add
        </button>
      </button>

      {/* Content */}
      {open && (
        <div className="mt-2">
          {loading ? (
            <p className="text-xs text-zinc-400 py-2">Loading...</p>
          ) : (
            <ConversationList
              conversations={conversations}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      {/* Form modal */}
      <ConversationForm
        applicationId={application.id}
        applicationTitle={application.title}
        company={application.company}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={handleSave}
        prefill={
          application.interview_date
            ? { date: application.interview_date }
            : undefined
        }
      />
    </div>
  )
}
