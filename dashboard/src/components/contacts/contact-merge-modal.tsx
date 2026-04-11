"use client"

import { useState } from "react"
import { ArrowLeftRight, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useContacts } from "@/hooks/use-contacts"
import type { Contact } from "@/types"

interface ContactMergeModalProps {
  primaryContact: Contact
  secondaryContact: Contact
  open: boolean
  onClose: () => void
  onMerged: (contact: Contact) => void
}

type FieldKey = "name" | "email" | "phone" | "company" | "title" | "notes"

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  title: "Title",
  notes: "Notes",
}

const FIELDS: FieldKey[] = ["name", "email", "phone", "company", "title", "notes"]

function getFieldValue(contact: Contact, field: FieldKey): string | null {
  return contact[field] ?? null
}

export function ContactMergeModal({
  primaryContact,
  secondaryContact,
  open,
  onClose,
  onMerged,
}: ContactMergeModalProps) {
  const [primary, setPrimary] = useState<Contact>(primaryContact)
  const [secondary, setSecondary] = useState<Contact>(secondaryContact)
  const [merging, setMerging] = useState(false)

  const { mergeContacts } = useContacts({ enabled: false })

  // Compute the merged result: primary field wins; secondary fills nulls
  const mergePreview: Record<FieldKey, string | null> = {} as Record<FieldKey, string | null>
  for (const field of FIELDS) {
    const pVal = getFieldValue(primary, field)
    const sVal = getFieldValue(secondary, field)
    mergePreview[field] = pVal ?? sVal
  }

  function handleSwap() {
    setPrimary(secondary)
    setSecondary(primary)
  }

  async function handleMerge() {
    setMerging(true)
    const result = await mergeContacts(primary.id, secondary.id)
    setMerging(false)

    if (!result.error && result.data) {
      onMerged(result.data)
      onClose()
    }
    // mergeContacts already shows a toast on error/success via use-contacts
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge Contacts</DialogTitle>
        </DialogHeader>

        {/* Swap button */}
        <div className="flex items-center justify-end mb-1">
          <button
            type="button"
            onClick={handleSwap}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <ArrowLeftRight size={12} />
            Swap Primary / Secondary
          </button>
        </div>

        {/* Two-column field comparison */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Primary header */}
          <div className="px-3 py-2 rounded-lg border-2 border-amber-400 bg-amber-50">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-0.5">
              Primary (kept)
            </p>
            <p className="text-sm font-bold text-zinc-800 truncate">{primary.name}</p>
          </div>

          {/* Secondary header */}
          <div className="px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-0.5">
              Secondary (merged in)
            </p>
            <p className="text-sm font-medium text-zinc-500 truncate">{secondary.name}</p>
          </div>
        </div>

        {/* Field rows (skip name since shown in headers) */}
        <div className="space-y-1.5 mb-4">
          {(FIELDS.filter((f) => f !== "name") as FieldKey[]).map((field) => {
            const pVal = getFieldValue(primary, field)
            const sVal = getFieldValue(secondary, field)
            const willFill = !pVal && !!sVal

            return (
              <div key={field} className="grid grid-cols-[80px_1fr_1fr] gap-2 items-start">
                {/* Label */}
                <div className="text-[11px] font-semibold text-zinc-400 pt-1.5">
                  {FIELD_LABELS[field]}
                </div>

                {/* Primary value */}
                <div className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-sm font-medium text-zinc-800 min-h-[32px] break-words">
                  {pVal || <span className="text-zinc-300 text-xs italic">empty</span>}
                </div>

                {/* Secondary value */}
                <div
                  className={`px-2.5 py-1.5 rounded-lg border min-h-[32px] text-sm break-words ${
                    willFill
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-medium"
                      : "border-zinc-100 bg-zinc-50 text-zinc-400"
                  }`}
                >
                  {sVal ? (
                    <>
                      {sVal}
                      {willFill && (
                        <span className="ml-1.5 text-[10px] font-semibold text-emerald-600">
                          will fill
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-300 text-xs italic">empty</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Merge preview */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Result after merge
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {FIELDS.map((field) => {
              const val = mergePreview[field]
              return val ? (
                <div key={field} className="text-xs text-zinc-700">
                  <span className="font-semibold text-zinc-500">{FIELD_LABELS[field]}:</span>{" "}
                  <span className="truncate">{field === "notes" && val.length > 60 ? val.slice(0, 60) + "…" : val}</span>
                </div>
              ) : null
            })}
          </div>
          {FIELDS.every((f) => !mergePreview[f]) && (
            <p className="text-xs text-zinc-400 italic">No fields to show</p>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={merging}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={merging}
            className="bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
          >
            {merging && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            Merge Contacts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
