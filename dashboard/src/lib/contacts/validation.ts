// Simple RFC-5322-ish email validation (practical, not full spec)
export function validateContactEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
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
