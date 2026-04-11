"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import type { Contact, ContactWithLinks } from "@/types"

const supabase = createClient()
const DEBOUNCE_MS = 500

interface UseContactsOptions {
  search?: string
  role?: string
  recency?: string
  enabled?: boolean
}

export function useContacts(options: UseContactsOptions = {}) {
  const { search, role, recency, enabled = true } = options

  const [contacts, setContacts] = useState<ContactWithLinks[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchContacts = useCallback(async () => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (role) params.set("role", role)
    if (recency) params.set("recency", recency)

    try {
      const resp = await fetch(`/api/contacts?${params}`)
      if (resp.ok) {
        const data = await resp.json()
        setContacts(data.contacts || [])
        setError(null)
      } else {
        const data = await resp.json()
        setError(data.error || "Failed to load contacts")
      }
    } catch {
      setError("Network error")
    }
    setLoading(false)
  }, [search, role, recency])

  const debouncedFetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(fetchContacts, DEBOUNCE_MS)
  }, [fetchContacts])

  // Reset fetch tracking when filters change
  useEffect(() => {
    hasFetched.current = false
  }, [search, role, recency])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    if (!hasFetched.current) {
      hasFetched.current = true
      fetchContacts()
    }

    // Real-time subscription
    const channel = supabase
      .channel("contacts-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
        },
        () => {
          debouncedFetch()
        }
      )
      .subscribe()

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      supabase.removeChannel(channel)
    }
  }, [enabled, fetchContacts, debouncedFetch])

  const createContact = useCallback(async (contact: Partial<Contact>) => {
    const resp = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact),
    })

    const data = await resp.json()

    if (!resp.ok) {
      toast.error(data.error || "Failed to create contact")
      return { data: null, error: data.error }
    }

    toast.success(`Contact created: ${data.contact?.name}`)
    return { data: data.contact as Contact, error: null }
  }, [])

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    const resp = await fetch(`/api/contacts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })

    const data = await resp.json()

    if (!resp.ok) {
      toast.error(data.error || "Failed to update contact")
      return { data: null, error: data.error }
    }

    toast.success("Contact updated")
    return { data: data.contact as Contact, error: null }
  }, [])

  const deleteContact = useCallback(async (id: string) => {
    const resp = await fetch(`/api/contacts/${id}`, { method: "DELETE" })

    if (!resp.ok) {
      const data = await resp.json()
      toast.error(data.error || "Failed to delete contact")
      return { error: data.error }
    }

    toast.success("Contact deleted")
    return { error: null }
  }, [])

  const mergeContacts = useCallback(
    async (primaryId: string, secondaryId: string) => {
      const resp = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_id: primaryId, secondary_id: secondaryId }),
      })

      const data = await resp.json()

      if (!resp.ok) {
        toast.error(data.error || "Failed to merge contacts")
        return { data: null, error: data.error }
      }

      toast.success("Contacts merged successfully")
      return { data: data.contact as Contact, error: null }
    },
    []
  )

  return {
    contacts,
    loading,
    error,
    createContact,
    updateContact,
    deleteContact,
    mergeContacts,
  }
}
