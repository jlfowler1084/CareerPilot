"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validateContactEmail } from "@/lib/contacts/validation"
import type { Contact } from "@/types"

interface ContactEditModalProps {
  contact: Contact
  open: boolean
  onClose: () => void
  onSaved: (updated: Contact) => void
}

export function ContactEditModal({
  contact,
  open,
  onClose,
  onSaved,
}: ContactEditModalProps) {
  const [name, setName] = useState(contact.name)
  const [email, setEmail] = useState(contact.email || "")
  const [phone, setPhone] = useState(contact.phone || "")
  const [company, setCompany] = useState(contact.company || "")
  const [title, setTitle] = useState(contact.title || "")
  const [notes, setNotes] = useState(contact.notes || "")

  const [nameError, setNameError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [saving, setSaving] = useState(false)
  const [dedupWarning, setDedupWarning] = useState(false)

  // Sync form state when contact changes (e.g., after external update)
  useEffect(() => {
    if (open) {
      setName(contact.name)
      setEmail(contact.email || "")
      setPhone(contact.phone || "")
      setCompany(contact.company || "")
      setTitle(contact.title || "")
      setNotes(contact.notes || "")
      setNameError("")
      setEmailError("")
      setDedupWarning(false)
    }
  }, [open, contact])

  function validate(): boolean {
    let valid = true
    setNameError("")
    setEmailError("")

    if (!name.trim()) {
      setNameError("Name is required")
      valid = false
    }
    if (email && !validateContactEmail(email)) {
      setEmailError("Invalid email format")
      valid = false
    }
    return valid
  }

  async function handleSave() {
    if (!validate()) return

    // If email changed, backend will check dedup and return 409
    setSaving(true)
    setDedupWarning(false)

    try {
      const resp = await fetch(`/api/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email || null,
          phone: phone || null,
          company: company || null,
          title: title || null,
          notes: notes || null,
        }),
      })

      const data = await resp.json()

      if (!resp.ok) {
        if (resp.status === 409) {
          setDedupWarning(true)
          setSaving(false)
          return
        }
        setEmailError(data.error || "Save failed")
        setSaving(false)
        return
      }

      onSaved(data.contact as Contact)
      onClose()
    } catch {
      setEmailError("Network error — please try again")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              aria-invalid={!!nameError}
            />
            {nameError && (
              <p className="text-[11px] text-red-500 mt-0.5">{nameError}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              aria-invalid={!!emailError}
            />
            {emailError && (
              <p className="text-[11px] text-red-500 mt-0.5">{emailError}</p>
            )}
            {dedupWarning && (
              <p className="text-[11px] text-amber-600 mt-0.5 bg-amber-50 px-2 py-1 rounded">
                Another contact with this email already exists. Change the email or merge
                contacts from the Contacts hub.
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">
              Phone
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          {/* Company */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">
              Company
            </label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name"
            />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Job title"
            />
          </div>

          {/* Source — read only */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">
              Source
            </label>
            <p className="text-sm text-zinc-500 px-2.5 py-1.5 bg-zinc-50 rounded-lg border border-zinc-200 capitalize">
              {contact.source.replace(/_/g, " ")}
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              className="w-full text-sm border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300 min-h-[70px]"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
