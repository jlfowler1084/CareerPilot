/**
 * Pure helper for building the /api/contacts query string from hook options.
 * Lives in lib/ (not alongside the hook) so tests can import it without
 * triggering the Supabase client module-level side effect in use-contacts.ts.
 */
interface ContactsQueryOptions {
  search?: string
  role?: string
  recency?: string
}

export function buildContactsQuery(options: ContactsQueryOptions): string {
  const params = new URLSearchParams()
  if (options.search) params.set("search", options.search)
  if (options.role) params.set("role", options.role)
  if (options.recency) params.set("recency", options.recency)
  return params.toString()
}
