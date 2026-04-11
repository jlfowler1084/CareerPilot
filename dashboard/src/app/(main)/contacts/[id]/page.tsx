"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { ContactSummaryCard } from "@/components/contacts/contact-summary-card"
import { ContactTimeline } from "@/components/contacts/contact-timeline"
import { ContactEditModal } from "@/components/contacts/contact-edit-modal"
import { ContactDeleteDialog } from "@/components/contacts/contact-delete-dialog"
import type { Contact, ContactWithLinks, Email, Conversation } from "@/types"

export default function ContactDetailPage() {
  const params = useParams()
  const router = useRouter()
  const contactId = params?.id as string

  const [contact, setContact] = useState<ContactWithLinks | null>(null)
  const [emails, setEmails] = useState<Email[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!contactId) return
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  async function loadAll() {
    setLoading(true)
    setNotFound(false)

    try {
      const [contactResp, timelineResp] = await Promise.all([
        fetch(`/api/contacts/${contactId}`),
        fetch(`/api/contacts/${contactId}/timeline`),
      ])

      if (contactResp.status === 404) {
        setNotFound(true)
        setLoading(false)
        return
      }

      if (!contactResp.ok) {
        toast.error("Failed to load contact")
        setLoading(false)
        return
      }

      const contactData = await contactResp.json()
      // Flatten contact_application_links into applications array
      const raw = contactData.contact
      const applications = (raw.contact_application_links ?? [])
        .map((link: { application: Pick<Contact, "id"> | null }) => link.application)
        .filter(Boolean)

      setContact({ ...raw, applications })

      if (timelineResp.ok) {
        const timelineData = await timelineResp.json()
        setEmails(timelineData.emails || [])
        setConversations(timelineData.conversations || [])
      }
    } catch {
      toast.error("Network error loading contact")
    } finally {
      setLoading(false)
    }
  }

  async function handleNotesChange(notes: string) {
    if (!contact) return
    const resp = await fetch(`/api/contacts/${contactId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        title: contact.title,
        notes,
        last_contact_date: contact.last_contact_date,
      }),
    })
    if (!resp.ok) {
      toast.error("Failed to save notes")
    }
  }

  function handleContactSaved(updated: Contact) {
    if (!contact) return
    setContact({ ...contact, ...updated })
    toast.success("Contact updated")
  }

  function handleDeleted() {
    toast.success("Contact deleted")
    router.push("/contacts")
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    )
  }

  // --- 404 state ---
  if (notFound || !contact) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-2xl font-semibold text-zinc-700 mb-2">Contact not found</p>
        <p className="text-sm text-zinc-400 mb-6">
          This contact may have been deleted or the link is incorrect.
        </p>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          <ArrowLeft size={14} />
          Back to Contacts
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Back link */}
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Contacts
        </Link>

        {/* Summary card */}
        <ContactSummaryCard
          contact={contact}
          onNotesChange={handleNotesChange}
          onEditClick={() => setEditOpen(true)}
          onDeleteClick={() => setDeleteOpen(true)}
        />

        {/* Timeline */}
        <ContactTimeline emails={emails} conversations={conversations} />
      </div>

      {/* Edit modal */}
      <ContactEditModal
        contact={contact}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={handleContactSaved}
      />

      {/* Delete dialog */}
      <ContactDeleteDialog
        contact={contact}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={handleDeleted}
      />
    </>
  )
}
