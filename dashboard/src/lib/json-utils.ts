/**
 * Sanitize raw LLM response text before JSON.parse().
 * Strips markdown code fences, preamble text, and trailing text
 * that Claude and other LLMs sometimes include around JSON output.
 */
export function sanitizeJsonResponse(raw: string): string {
  let cleaned = raw.trim()

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "")
  cleaned = cleaned.replace(/\n?\s*```$/i, "")

  // Strip any preamble before the first { or [
  const jsonStart = cleaned.search(/[\[{]/)
  if (jsonStart > 0) {
    cleaned = cleaned.substring(jsonStart)
  }

  // Strip any trailing text after the last } or ]
  const lastBrace = cleaned.lastIndexOf("}")
  const lastBracket = cleaned.lastIndexOf("]")
  const jsonEnd = Math.max(lastBrace, lastBracket)
  if (jsonEnd > 0 && jsonEnd < cleaned.length - 1) {
    cleaned = cleaned.substring(0, jsonEnd + 1)
  }

  return cleaned
}

/**
 * Parse a JSON response from a Claude API call with sanitization and error context.
 * Returns the parsed object or throws with diagnostic info.
 */
export function parseJsonResponse<T = unknown>(raw: string): T {
  const sanitized = sanitizeJsonResponse(raw)
  try {
    return JSON.parse(sanitized) as T
  } catch {
    // Log full raw response for debugging
    console.error("Failed to parse AI JSON response. Raw text:", raw.slice(0, 500))
    throw new Error(
      `Failed to parse AI response. Preview: ${raw.slice(0, 200)}`
    )
  }
}
