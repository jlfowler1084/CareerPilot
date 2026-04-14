"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { CONVERSATION_TYPES } from "@/lib/constants"
import type {
  ConversationType,
  ConversationPerson,
  QuestionAsked,
  QuestionYouAsked,
  ActionItem,
} from "@/types"

interface ConversationFormProps {
  applicationId: string
  applicationTitle: string
  company: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (conversation: Record<string, unknown>) => Promise<{ error: string | null }>
  /** Pre-fill date and duration from calendar event */
  prefill?: { date?: string; duration_minutes?: number }
}

function nowLocalISO(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function ConversationForm({
  applicationId,
  applicationTitle,
  company,
  open,
  onOpenChange,
  onSave,
  prefill,
}: ConversationFormProps) {
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<ConversationType>("phone")
  const [title, setTitle] = useState("")
  const [date, setDate] = useState(prefill?.date?.slice(0, 16) || nowLocalISO())
  const [duration, setDuration] = useState(prefill?.duration_minutes?.toString() || "")
  const [notes, setNotes] = useState("")
  const [sentiment, setSentiment] = useState<number>(0)
  const [people, setPeople] = useState<ConversationPerson[]>([])
  const [peopleEmailErrors, setPeopleEmailErrors] = useState<Record<number, string>>({})
  const [questionsAsked, setQuestionsAsked] = useState<QuestionAsked[]>([])
  const [questionsYouAsked, setQuestionsYouAsked] = useState<QuestionYouAsked[]>([])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])

  function reset() {
    setType("phone")
    setTitle("")
    setDate(nowLocalISO())
    setDuration("")
    setNotes("")
    setSentiment(0)
    setPeople([])
    setPeopleEmailErrors({})
    setQuestionsAsked([])
    setQuestionsYouAsked([])
    setActionItems([])
  }

  async function handleSubmit() {
    setSaving(true)
    const result = await onSave({
      application_id: applicationId,
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
    })
    setSaving(false)

    if (!result.error) {
      reset()
      onOpenChange(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  // Dynamic list helpers
  function addPerson() {
    setPeople([...people, { name: "", role: "" }])
  }
  function updatePerson(i: number, field: keyof ConversationPerson, value: string) {
    const copy = [...people]
    copy[i] = { ...copy[i], [field]: value }
    setPeople(copy)
    if (field === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const errors = { ...peopleEmailErrors }
      if (value && !emailRegex.test(value)) {
        errors[i] = "Invalid email address"
      } else {
        delete errors[i]
      }
      setPeopleEmailErrors(errors)
    }
  }
  function removePerson(i: number) {
    setPeople(people.filter((_, j) => j !== i))
    const errors = { ...peopleEmailErrors }
    delete errors[i]
    // Re-key errors for shifted indices after removal
    const reKeyed: Record<number, string> = {}
    Object.entries(errors).forEach(([k, v]) => {
      const idx = parseInt(k, 10)
      if (idx > i) reKeyed[idx - 1] = v
      else reKeyed[idx] = v
    })
    setPeopleEmailErrors(reKeyed)
  }

  function addQuestionAsked() {
    setQuestionsAsked([...questionsAsked, { question: "", your_answer: "" }])
  }
  function updateQuestionAsked(i: number, field: keyof QuestionAsked, value: string) {
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
          <DialogTitle>Log Conversation</DialogTitle>
          <DialogDescription>
            {applicationTitle} at {company}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Type + Title row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">
                Type
              </label>
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
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Initial phone screen"
                className={inputClass}
              />
            </div>
          </div>

          {/* Date + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">
                Date & Time
              </label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">
                Duration (minutes)
              </label>
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

          {/* Sentiment */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">
              How did it go?
            </label>
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
                <span className="text-xs text-zinc-400 self-center ml-2">
                  {sentiment}/5
                </span>
              )}
            </div>
          </div>

          {/* People */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-500">
                People Involved
              </label>
              <button
                type="button"
                onClick={addPerson}
                className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
              >
                <Plus size={10} /> Add
              </button>
            </div>
            {people.map((p, i) => (
              <div key={i} className="mb-3">
                <div className="flex gap-2">
                  <input
                    value={p.name}
                    onChange={(e) => updatePerson(i, "name", e.target.value)}
                    placeholder="Name"
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    value={p.role || ""}
                    onChange={(e) => updatePerson(i, "role", e.target.value)}
                    placeholder="Role"
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    type="text"
                    value={p.email || ""}
                    onChange={(e) => updatePerson(i, "email", e.target.value)}
                    placeholder="Email (optional)"
                    className={`${inputClass} flex-1${peopleEmailErrors[i] ? " border-red-400 focus:ring-red-300" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => removePerson(i)}
                    title="Remove person"
                    className="text-zinc-400 hover:text-red-500 px-1 shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {peopleEmailErrors[i] && (
                  <p className="text-[10px] text-red-500 mt-1 ml-1">{peopleEmailErrors[i]}</p>
                )}
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 mb-1 block">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key takeaways, impressions, details..."
              rows={4}
              className={`${inputClass} resize-none`}
            />
            <p className="text-[10px] text-zinc-400 mt-1">
              AI will auto-extract topic tags from your notes.
            </p>
          </div>

          {/* Questions They Asked */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-500">
                Questions They Asked
              </label>
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
                      onChange={(e) =>
                        updateQuestionAsked(i, "question", e.target.value)
                      }
                      placeholder="Their question"
                      className={inputClass}
                    />
                    <textarea
                      value={q.your_answer}
                      onChange={(e) =>
                        updateQuestionAsked(i, "your_answer", e.target.value)
                      }
                      placeholder="Your answer"
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
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
              <label className="text-xs font-semibold text-zinc-500">
                Questions You Asked
              </label>
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
                      onChange={(e) =>
                        updateQuestionYouAsked(i, "question", e.target.value)
                      }
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

          {/* Action Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-500">
                Action Items
              </label>
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
                  onChange={(e) =>
                    updateActionItem(i, "due_date", e.target.value)
                  }
                  className={`${inputClass} w-36`}
                />
                <button
                  type="button"
                  onClick={() => removeActionItem(i)}
                  className="text-zinc-400 hover:text-red-500"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            Save Conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
