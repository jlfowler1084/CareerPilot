/**
 * Sanitize raw LLM response text before JSON.parse().
 * Strips markdown code fences, preamble text, and trailing text
 * that Claude and other LLMs sometimes include around JSON output.
 */
export function sanitizeJsonResponse(raw: string): string {
  let cleaned = raw.trim()

  // Strip markdown code fences (handle leading whitespace, newlines, case variations)
  cleaned = cleaned.replace(/^\s*```(?:json)?\s*\n?/im, "")
  cleaned = cleaned.replace(/\n?\s*```\s*$/im, "")

  // Fallback: if fences survived the regex, brute-force strip
  if (cleaned.trimStart().startsWith("```")) {
    const lines = cleaned.split("\n")
    if (lines[0].trim().startsWith("```")) lines.shift()
    if (lines[lines.length - 1]?.trim() === "```") lines.pop()
    cleaned = lines.join("\n")
  }

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

  // Check for truncated response (incomplete JSON)
  const trimmed = sanitized.trim()
  if (trimmed.length > 0) {
    const lastChar = trimmed[trimmed.length - 1]
    if (lastChar !== "}" && lastChar !== "]") {
      throw new Error(
        "AI response appears truncated (does not end with } or ]). " +
        "The response may have exceeded the token limit. " +
        `Preview: ${trimmed.substring(0, 200)}...`
      )
    }
  }

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
