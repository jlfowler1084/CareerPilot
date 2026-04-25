// Simple RFC-5322-ish email validation (practical, not full spec)
export function validateContactEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Normalize an email address for dedup and storage:
 * - Trims leading/trailing whitespace
 * - Converts to lowercase
 * - Returns null for null, undefined, or empty-after-trim inputs
 */
export function normalizeContactEmail(email: string | null | undefined): string | null {
  if (email == null) return null
  const trimmed = email.trim()
  if (trimmed.length === 0) return null
  return trimmed.toLowerCase()
}

export function sanitizeContactName(name: string): string {
  // Strip HTML tags and length-bound
  return name.replace(/<[^>]*>/g, '').trim().slice(0, 255)
}

export function validateContactInput(input: { name?: string; email?: string | null }): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!input.name || input.name.trim().length === 0) {
    errors.push("Name is required")
  }
  if (input.email && !validateContactEmail(input.email)) {
    errors.push("Invalid email format")
  }
  return { valid: errors.length === 0, errors }
}
