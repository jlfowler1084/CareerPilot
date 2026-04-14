"use client"

import { ContactRow } from "@/components/contacts/contact-row"
import type { ContactWithLinks } from "@/types"

interface ContactListProps {
  contacts: ContactWithLinks[]
  loading: boolean
  isFiltered: boolean
  onAddContact: () => void
  onClearFilters: () => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

export function ContactList({
  contacts,
  loading,
  isFiltered,
  onAddContact,
  onClearFilters,
  selectedIds,
  onToggleSelect,
}: ContactListProps) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-zinc-100 rounded-xl" />
        ))}
      </div>
    )
  }

  if (contacts.length === 0 && !isFiltered) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
        <p className="text-sm text-zinc-500 mb-4">
          No contacts yet. Contacts are automatically created when you scan recruiter emails, or you
          can add them manually.
        </p>
        <button
          type="button"
          onClick={onAddContact}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-amber-500 border-amber-500 text-white hover:bg-amber-600 transition-colors"
        >
          Add Contact
        </button>
      </div>
    )
  }

  if (contacts.length === 0 && isFiltered) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
        <p className="text-sm text-zinc-500 mb-3">No contacts match your search.</p>
        <button
          type="button"
          onClick={onClearFilters}
          className="text-xs font-semibold text-amber-600 hover:underline"
        >
          Clear filters
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {contacts.map((contact) => (
        <ContactRow
          key={contact.id}
          contact={contact}
          selected={selectedIds?.has(contact.id) ?? false}
          onToggleSelect={onToggleSelect ? () => onToggleSelect(contact.id) : undefined}
        />
      ))}
    </div>
  )
}
