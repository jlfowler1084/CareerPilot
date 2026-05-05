"use client"

import { useState } from "react"
import { Plus, Loader2, GitMerge } from "lucide-react"
import { useContacts } from "@/hooks/use-contacts"
import { ContactFilters } from "@/components/contacts/contact-filters"
import { ContactList } from "@/components/contacts/contact-list"
import { ContactMergeModal } from "@/components/contacts/contact-merge-modal"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { Contact } from "@/types"

const inputClass =
  "w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"

interface CreateFormState {
  name: string
  email: string
  phone: string
  company: string
  title: string
  notes: string
}

const EMPTY_FORM: CreateFormState = {
  name: "",
  email: "",
  phone: "",
  company: "",
  title: "",
  notes: "",
}

function isValidEmail(email: string): boolean {
  if (!email) return true // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function ContactsPage() {
  // Filter state — passed into the hook for server-side filtering
  const [search, setSearch] = useState("")
  const [role, setRole] = useState("")
  const [recency, setRecency] = useState("")

  // Resolve "__all__" sentinel back to empty string (Select requires a non-empty value)
  const effectiveRole = role === "__all__" ? "" : role
  const effectiveRecency = recency === "__all__" ? "" : recency

  const { contacts, loading, createContact } = useContacts({
    search,
    role: effectiveRole,
    recency: effectiveRecency,
  })

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [emailError, setEmailError] = useState("")

  // Multi-select + merge state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mergeModalOpen, setMergeModalOpen] = useState(false)

  const isFiltered = !!(search || effectiveRole || effectiveRecency)

  // Derive the two selected contacts when exactly 2 are selected
  const selectedContacts = contacts.filter((c) => selectedIds.has(c.id))
  const canMerge = selectedContacts.length === 2

  function toggleContactSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleMergeComplete(merged: Contact) {
    setSelectedIds(new Set())
    setMergeModalOpen(false)
    // The real-time subscription in useContacts will refresh the list automatically,
    // but we also reset selection state here for immediate UX feedback.
    void merged // merged contact available if needed for navigation
  }

  function handleClearFilters() {
    setSearch("")
    setRole("")
    setRecency("")
  }

  function openCreateDialog() {
    setForm(EMPTY_FORM)
    setEmailError("")
    setDialogOpen(true)
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      setForm(EMPTY_FORM)
      setEmailError("")
    }
    setDialogOpen(open)
  }

  function handleFieldChange(field: keyof CreateFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === "email") {
      setEmailError(value && !isValidEmail(value) ? "Enter a valid email address" : "")
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return
    if (form.email && !isValidEmail(form.email)) {
      setEmailError("Enter a valid email address")
      return
    }

    setSaving(true)
    const result = await createContact({
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      title: form.title.trim() || null,
      notes: form.notes.trim() || null,
      source: "manual",
    })
    setSaving(false)

    if (!result.error) {
      setDialogOpen(false)
      setForm(EMPTY_FORM)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Contacts</h2>
          {!loading && (
            <p className="text-xs text-zinc-400 mt-0.5">
              {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
              {selectedIds.size > 0 && (
                <span className="ml-2 text-amber-600 font-semibold">
                  {selectedIds.size} selected
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canMerge && (
            <button
              type="button"
              onClick={() => setMergeModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <GitMerge size={12} />
              Merge
            </button>
          )}
          <button
            type="button"
            onClick={openCreateDialog}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-amber-500 border-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            <Plus size={12} />
            Add Contact
          </button>
        </div>
      </div>

      {/* Filters */}
      <ContactFilters
        search={search}
        role={role}
        recency={recency}
        onSearchChange={setSearch}
        onRoleChange={setRole}
        onRecencyChange={setRecency}
        totalCount={contacts.length}
        filteredCount={contacts.length}
      />

      {/* Contact list */}
      <ContactList
        contacts={contacts}
        loading={loading}
        isFiltered={isFiltered}
        onAddContact={openCreateDialog}
        onClearFilters={handleClearFilters}
        selectedIds={selectedIds}
        onToggleSelect={toggleContactSelection}
      />

      {/* Merge contacts modal */}
      {canMerge && mergeModalOpen && (
        <ContactMergeModal
          primaryContact={selectedContacts[0]}
          secondaryContact={selectedContacts[1]}
          open={mergeModalOpen}
          onClose={() => setMergeModalOpen(false)}
          onMerged={handleMergeComplete}
        />
      )}

      {/* Create contact dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Manually add a contact to your network.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name (required) */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                placeholder="Jane Smith"
                className={inputClass}
                autoFocus
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleFieldChange("email", e.target.value)}
                placeholder="jane@example.com"
                className={inputClass}
              />
              {emailError && (
                <p className="text-xs text-red-500 mt-1">{emailError}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
                placeholder="(317) 555-0100"
                className={inputClass}
              />
            </div>

            {/* Company + Title row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-500 mb-1 block">Company</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => handleFieldChange("company", e.target.value)}
                  placeholder="Acme Corp"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 mb-1 block">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => handleFieldChange("title", e.target.value)}
                  placeholder="Technical Recruiter"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 mb-1 block">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="How you met, context, anything useful..."
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !!emailError}
            >
              {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Save Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
