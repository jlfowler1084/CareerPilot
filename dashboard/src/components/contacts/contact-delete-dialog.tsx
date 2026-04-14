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
import { AlertTriangle } from "lucide-react"
import type { Contact } from "@/types"

interface ContactDeleteDialogProps {
  contact: Contact
  open: boolean
  onClose: () => void
  onDeleted: () => void
}

export function ContactDeleteDialog({
  contact,
  open,
  onClose,
  onDeleted,
}: ContactDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  async function handleDelete() {
    setDeleting(true)
    setError("")

    try {
      const resp = await fetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
      })

      if (!resp.ok) {
        let message = "Failed to delete contact"
        try {
          const data = await resp.json()
          message = data.error || message
        } catch {
          // ignore
        }
        setError(message)
        setDeleting(false)
        return
      }

      onDeleted()
    } catch {
      setError("Network error — please try again")
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={15} className="text-red-500" />
            </div>
            <DialogTitle>Delete Contact</DialogTitle>
          </div>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-semibold text-zinc-800">{contact.name}</span>? This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            What will happen
          </p>
          <ul className="space-y-1.5 text-sm text-zinc-600">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 flex-shrink-0">\u2022</span>
              Linked applications will lose this contact link
            </li>
            <li className="flex items-start gap-2">
              <span className="text-zinc-400 mt-0.5 flex-shrink-0">\u2022</span>
              Email records are not deleted
            </li>
            <li className="flex items-start gap-2">
              <span className="text-zinc-400 mt-0.5 flex-shrink-0">\u2022</span>
              Conversation records are not deleted
            </li>
            <li className="flex items-start gap-2">
              <span className="text-zinc-400 mt-0.5 flex-shrink-0">\u2022</span>
              If a new contact with the same email is created later, orphaned records
              will re-appear in their timeline
            </li>
          </ul>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete Contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
