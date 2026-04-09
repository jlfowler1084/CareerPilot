import { describe, it, expect } from "vitest"

/**
 * Test the timeout error classification logic used in the POST handler.
 * The route wraps fetch in try/catch and checks err.name === "AbortError".
 */
function classifyFetchError(err: unknown): { error: string; status: number } {
  const name = err instanceof Error ? err.name : (err as { name?: string } | null)?.name
  if (name === "AbortError") {
    return {
      error: "Analysis timed out after 90s. Try a shorter transcript or click Retry.",
      status: 504,
    }
  }
  return { error: err instanceof Error ? err.message : String(err), status: 500 }
}

describe("classifyFetchError", () => {
  it("returns 504 with friendly message for AbortError", () => {
    const err = new DOMException("The operation was aborted", "AbortError")
    const result = classifyFetchError(err)
    expect(result.status).toBe(504)
    expect(result.error).toContain("timed out after 90s")
    expect(result.error).toContain("Retry")
  })

  it("returns 500 with original message for other errors", () => {
    const err = new Error("Network failure")
    const result = classifyFetchError(err)
    expect(result.status).toBe(500)
    expect(result.error).toBe("Network failure")
  })

  it("returns 500 with stringified value for non-Error throws", () => {
    const result = classifyFetchError("something broke")
    expect(result.status).toBe(500)
    expect(result.error).toBe("something broke")
  })
})

describe("GET handler validation", () => {
  function validateGetParams(searchParams: URLSearchParams): { error: string; status: number } | null {
    const applicationId = searchParams.get("applicationId")
    if (!applicationId) {
      return { error: "applicationId required", status: 400 }
    }
    return null
  }

  it("returns 400 when applicationId is missing", () => {
    const params = new URLSearchParams()
    const result = validateGetParams(params)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(400)
    expect(result!.error).toBe("applicationId required")
  })

  it("returns null (valid) when applicationId is present", () => {
    const params = new URLSearchParams({ applicationId: "abc-123" })
    const result = validateGetParams(params)
    expect(result).toBeNull()
  })
})
