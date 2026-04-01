"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { CONVERSATION_TYPES } from "@/lib/constants"
import { createClient } from "@/lib/supabase/client"
import type {
  Conversation,
  ConversationType,
  ConversationPerson,
  QuestionAsked,
  QuestionYouAsked,
  ActionItem,
  Application,
} from "@/types"

interface ConversationFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Record<string, unknown>) => Promise<{ data: unknown; error: string | null }>
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<{ data: unknown; error: string | null }>
  /** Pass an existing conversation to enter edit mode */
  conversation?: Conversation | null
}

function nowLocalISO(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function ConversationFormModal({
  open,
  onOpenChange,
  onSave,
  onUpdate,
  conversation,
}: ConversationFormModalProps) {
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<ConversationType>("phone")
  const [title, setTitle] = useState("")
  const [date, setDate] = useState(nowLocalISO())
  const [duration, setDuration] = useState("")
  const [notes, setNotes] = useState("")
  const [sentiment, setSentiment] = useState<number>(0)
  const [people, setPeople] = useState<ConversationPerson[]>([])
  const [questionsAsked, setQuestionsAsked] = useState<QuestionAsked[]>([])
  const [questionsYouAsked, setQuestionsYouAsked] = useState<QuestionYouAsked[]>([])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [applicationId, setApplicationId] = useState("")
  const [applications, setApplications] = useState<Pick<Application, "id" | "company" | "title">[]>([])
  const [showQuestions, setShowQuestions] = useState(true)
  const [showActionItems, setShowActionItems] = useState(false)

  // Fetch applications on mount
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("applications")
      .select("id, company, title")
      .order("date_found", { ascending: false })
      .then(({ data }: { data: Pick<Application, "id" | "company" | "title">[] | null }) => {
        if (data) setApplications(data)
      })
  }, [])

  // Pre-fill from conversation prop (edit mode) or reset when conversation is null
  useEffect(() => {
    if (conversation) {
      setType(conversation.conversation_type)
      setTitle(conversation.title || "")
      const d = new Date(conversation.date)
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
      setDate(d.toISOString().slice(0, 16))
      setDuration(conversation.duration_minutes?.toString() || "")
      setNotes(conversation.notes || "")
      setSentiment(conversation.sentiment || 0)
      setPeople(conversation.people || [])
      setQuestionsAsked(conversation.questions_asked || [])
      setQuestionsYouAsked(conversation.questions_you_asked || [])
      setActionItems(conversation.action_items || [])
      setApplicationId(conversation.application_id || "")
    } else {
      reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation])

  function reset() {
    setType("phone")
    setTitle("")
    setDate(nowLocalISO())
    setDuration("")
    setNotes("")
    setSentiment(0)
    setPeople([])
    setQuestionsAsked([])
    setQuestionsYouAsked([])
    setActionItems([])
    setApplicationId("")
    setShowQuestions(true)
    setShowActionItems(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next && !conversation) reset()
    onOpenChange(next)
  }

  async function handleSubmit() {
    setSaving(true)
    const payload = {
      application_id: applicationId || null,
      conversation_type: type,
      title: title || null,
      date: new Date(date).toISOString(),
      duration_minutes: duration ? parseInt(duration, 10) : null,
      notes: notes || null,
      sentiment: sentiment || null,
      people,
      questions_asked: questionsAsked,
      questions_you_asked: questionsYouAsked,
      action_items: actionItems,
    }

    const result = conversation
      ? await onUpdate(conversation.id, payload)
      : await onSave(payload)

    setSaving(false)

    if (!result.error) {
      // Fire AI analysis in background (don't await)
      const savedId = conversation?.id || (result.data as { id: string })?.id
      if (savedId) {
        fetch("/api/conversations/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: savedId }),
        }).catch(() => {}) // best-effort
      }

      if (!conversation) reset()
      onOpenChange(false)
    }
  }

  // Dynamic list helpers
  function addPerson() {
    setPeople([...people, { name: "", role: "" }])
  }
  function updatePerson(i: number, field: keyof ConversationPerson, value: string) {
    const copy = [...people]
    copy[i] = { ...copy[i], [field]: value }
    setPeople(copy)
  }
  function removePerson(i: number) {
    setPeople(people.filter((_, j) => j !== i))
  }

  function addQuestionAsked() {
    setQuestionsAsked([...questionsAsked, { question: "", your_answer: "" }])
  }
  function updateQuestionAsked(i: number, field: keyof QuestionAsked, value: string | number | undefined) {
    const copy = [...questionsAsked]
    copy[i] = { ...copy[i], [field]: value }
    setQuestionsAsked(copy)
  }
  function removeQuestionAsked(i: number) {
    setQuestionsAsked(questionsAsked.filter((_, j) => j !== i))
  }

  function addQuestionYouAsked() {
    setQuestionsYouAsked([...questionsYouAsked, { question: "", their_response: "" }])
  }
  function updateQuestionYouAsked(i: number, field: keyof QuestionYouAsked, value: string) {
    const copy = [...questionsYouAsked]
    copy[i] = { ...copy[i], [field]: value }
    setQuestionsYouAsked(copy)
  }
  function removeQuestionYouAsked(i: number) {
    setQuestionsYouAsked(questionsYouAsked.filter((_, j) => j !== i))
  }

  function addActionItem() {
    setActionItems([...actionItems, { task: "", completed: false }])
  }
  function updateActionItem(i: number, field: string, value: string | boolean) {
    const copy = [...actionItems]
    copy[i] = { ...copy[i], [field]: value }
    setActionItems(copy)
  }
  function removeActionItem(i: number) {
    setActionItems(actionItems.filter((_, j) => j !== i))
  }

  const inputClass =
    "w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{conversation ? "Edit Conversation" : "Log Conversation"}</DialogTitle>
          <DialogDescription>
            {conversation
              ? "Update this conversation log"
              : "Record a conversation from your job search"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Row 1: Type + Date + Duration */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ConversationType)}
                className={inputClass}
              >
                {CONVERSATION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">Date &amp; Time</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">Duration (min)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="30"
                min={1}
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 2: Title + Application Link */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Phone screen with David Perez (TekSystems)"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">Link to Application</label>
              <select
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
                className={inputClass}
              >
                <option value="">None (standalone)</option>
                {applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company} — {a.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* People */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-500">People Involved</label>
              <button
                type="button"
                onClick={addPerson}
                className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
              >
                <Plus size={10} /> Add
              </button>
            </div>
            {people.map((p, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
                <input
                  value={p.name}
                  onChange={(e) => updatePerson(i, "name", e.target.value)}
                  placeholder="Name"
                  className={inputClass}
                />
                <input
                  value={p.role || ""}
                  onChange={(e) => updatePerson(i, "role", e.target.value)}
                  placeholder="Role"
                  className={inputClass}
                />
                <input
                  value={p.email || ""}
                  onChange={(e) => updatePerson(i, "email", e.target.value)}
                  placeholder="Email (optional)"
                  className={inputClass}
                />
                <div className="flex gap-2 items-center">
                  <input
                    value={p.phone || ""}
                    onChange={(e) => updatePerson(i, "phone", e.target.value)}
                    placeholder="Phone (optional)"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removePerson(i)}
                    className="text-zinc-400 hover:text-red-500 shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened? Key points, observations, anything you want to remember..."
              rows={4}
              className={`${inputClass} resize-none`}
            />
            <p className="text-[10px] text-zinc-400 mt-1">
              AI will auto-extract topic tags from your notes.
            </p>
          </div>

          {/* Collapsible: Questions & Answers (default expanded) */}
          <div>
            <button
              type="button"
              onClick={() => setShowQuestions(!showQuestions)}
              className="flex items-center gap-2 w-full text-left mb-2"
            >
              {showQuestions ? (
                <ChevronDown size={12} className="text-zinc-400" />
              ) : (
                <ChevronRight size={12} className="text-zinc-400" />
              )}
              <span className="text-xs font-semibold text-zinc-500">Questions &amp; Answers</span>
            </button>
            {showQuestions && (
              <div className="space-y-4 pl-5">
                {/* Questions They Asked */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-zinc-500">Questions They Asked</label>
                    <button
                      type="button"
                      onClick={addQuestionAsked}
                      className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
                    >
                      <Plus size={10} /> Add
                    </button>
                  </div>
                  {questionsAsked.map((q, i) => (
                    <div key={i} className="mb-3 bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <input
                            value={q.question}
                            onChange={(e) => updateQuestionAsked(i, "question", e.target.value)}
                            placeholder="Their question"
                            className={inputClass}
                          />
                          <textarea
                            value={q.your_answer}
                            onChange={(e) => updateQuestionAsked(i, "your_answer", e.target.value)}
                            placeholder="Your answer"
                            rows={2}
                            className={`${inputClass} resize-none`}
                          />
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-zinc-400">Answer quality:</label>
                            <select
                              value={q.quality_rating ?? ""}
                              onChange={(e) =>
                                updateQuestionAsked(
                                  i,
                                  "quality_rating",
                                  e.target.value ? parseInt(e.target.value, 10) : undefined,
                                )
                              }
                              className="text-sm border border-zinc-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-300"
                            >
                              <option value="">Rate</option>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}/5
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuestionAsked(i)}
                          className="text-zinc-400 hover:text-red-500 mt-2"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Questions You Asked */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-zinc-500">Questions You Asked</label>
                    <button
                      type="button"
                      onClick={addQuestionYouAsked}
                      className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
                    >
                      <Plus size={10} /> Add
                    </button>
                  </div>
                  {questionsYouAsked.map((q, i) => (
                    <div key={i} className="mb-3 bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <input
                            value={q.question}
                            onChange={(e) => updateQuestionYouAsked(i, "question", e.target.value)}
                            placeholder="Your question"
                            className={inputClass}
                          />
                          <textarea
                            value={q.their_response}
                            onChange={(e) =>
                              updateQuestionYouAsked(i, "their_response", e.target.value)
                            }
                            placeholder="Their response"
                            rows={2}
                            className={`${inputClass} resize-none`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuestionYouAsked(i)}
                          className="text-zinc-400 hover:text-red-500 mt-2"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Collapsible: Action Items (default collapsed) */}
          <div>
            <button
              type="button"
              onClick={() => setShowActionItems(!showActionItems)}
              className="flex items-center gap-2 w-full text-left mb-2"
            >
              {showActionItems ? (
                <ChevronDown size={12} className="text-zinc-400" />
              ) : (
                <ChevronRight size={12} className="text-zinc-400" />
              )}
              <span className="text-xs font-semibold text-zinc-500">Action Items</span>
            </button>
            {showActionItems && (
              <div className="pl-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-zinc-400">Tasks to follow up on</span>
                  <button
                    type="button"
                    onClick={addActionItem}
                    className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
                  >
                    <Plus size={10} /> Add
                  </button>
                </div>
                {actionItems.map((a, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input
                      value={a.task}
                      onChange={(e) => updateActionItem(i, "task", e.target.value)}
                      placeholder="Task"
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      type="date"
                      value={a.due_date || ""}
                      onChange={(e) => updateActionItem(i, "due_date", e.target.value)}
                      className={`${inputClass} w-36`}
                    />
                    <label className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                      <input
                        type="checkbox"
                        checked={a.completed}
                        onChange={(e) => updateActionItem(i, "completed", e.target.checked)}
                        className="rounded"
                      />
                      Done
                    </label>
                    <button
                      type="button"
                      onClick={() => removeActionItem(i)}
                      className="text-zinc-400 hover:text-red-500 shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sentiment */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">How did it go?</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSentiment(sentiment === n ? 0 : n)}
                  className={`text-xl transition-opacity ${
                    sentiment >= n ? "opacity-100" : "opacity-30"
                  } hover:opacity-80`}
                >
                  {"\u2B50"}
                </button>
              ))}
              {sentiment > 0 && (
                <span className="text-xs text-zinc-400 self-center ml-2">{sentiment}/5</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !type || !date}>
            {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            {conversation ? "Update Conversation" : "Save Conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
