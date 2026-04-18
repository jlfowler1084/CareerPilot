import { describe, it, expect } from "vitest"
import type { CoachingSession } from "@/types"

/**
 * When fetchSessions loads from DB and analyzeDebrief has already
 * appended a session optimistically, we replace state wholesale
 * (DB is source of truth). This test validates that approach.
 */
function mergeSessionsFromDb(
  dbSessions: CoachingSession[]
): CoachingSession[] {
  // DB fetch replaces state entirely — no dedup needed
  return Array.isArray(dbSessions) ? dbSessions : []
}

/**
 * SSE line parser — mirrors the logic in useCoaching analyzeDebrief.
 * Returns { deltas, session, error } extracted from the raw SSE lines.
 */
function parseSSEChunks(sseText: string): {
  deltas: string[]
  session: CoachingSession | null
  error: string | null
} {
  const lines = sseText.split("\n")
  const deltas: string[] = []
  let session: CoachingSession | null = null
  let error: string | null = null
  let currentEvent = ""

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim()
    } else if (line.startsWith("data: ")) {
      const raw = line.slice(6).trim()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(raw)
      } catch {
        continue
      }
      if (currentEvent === "delta" && typeof parsed.text === "string") {
        deltas.push(parsed.text)
      } else if (currentEvent === "done") {
        session = parsed as unknown as CoachingSession
      } else if (currentEvent === "error") {
        error = (parsed.error as string) || "Stream error"
      }
      currentEvent = ""
    }
  }

  return { deltas, session, error }
}

/**
 * Builds a mocked ReadableStream from a raw SSE string.
 * Used to simulate what the coaching analyze route sends back.
 */
function buildSSEStream(sseText: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(sseText)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

/**
 * Drains a ReadableStream and reassembles the full SSE text,
 * then delegates to parseSSEChunks — mirrors the hook's reader loop.
 */
async function consumeSSEStream(stream: ReadableStream<Uint8Array>): Promise<{
  deltas: string[]
  session: CoachingSession | null
  error: string | null
}> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let full = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      full += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  return parseSSEChunks(full)
}

const mockSession: CoachingSession = {
  id: "sess-1",
  application_id: "app-1",
  user_id: "user-1",
  session_type: "debrief",
  raw_input: "test notes",
  ai_analysis: { summary: "Good", question_analyses: [], top_3_focus_areas: [] },
  overall_score: 7,
  strong_points: ["PowerShell"],
  improvements: [],
  patterns_detected: null,
  created_at: "2026-04-08T14:00:00Z",
}

describe("mergeSessionsFromDb", () => {
  it("returns sessions array from valid DB response", () => {
    const result = mergeSessionsFromDb([mockSession])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("sess-1")
  })

  it("returns empty array for non-array input", () => {
    expect(mergeSessionsFromDb(null as unknown as CoachingSession[])).toEqual([])
    expect(mergeSessionsFromDb(undefined as unknown as CoachingSession[])).toEqual([])
  })

  it("returns empty array for empty DB response", () => {
    expect(mergeSessionsFromDb([])).toEqual([])
  })
})

describe("parseSSEChunks", () => {
  it("accumulates delta text and returns session on done event (streaming success)", () => {
    const sseText = [
      "event: delta",
      `data: ${JSON.stringify({ text: '{"summary":' })}`,
      "",
      "event: delta",
      `data: ${JSON.stringify({ text: '"Great job"}' })}`,
      "",
      "event: done",
      `data: ${JSON.stringify(mockSession)}`,
      "",
    ].join("\n")

    const { deltas, session, error } = parseSSEChunks(sseText)

    expect(deltas).toEqual(['{"summary":', '"Great job"}'])
    expect(deltas.join("")).toBe('{"summary":"Great job"}')
    expect(session).not.toBeNull()
    expect(session!.id).toBe("sess-1")
    expect(session!.overall_score).toBe(7)
    expect(error).toBeNull()
  })

  it("returns error and no session on stream-aborted / error event", () => {
    const sseText = [
      "event: delta",
      `data: ${JSON.stringify({ text: '{"summary":' })}`,
      "",
      "event: error",
      `data: ${JSON.stringify({ error: "Analysis timed out after 5 minutes. Try a shorter transcript or click Retry." })}`,
      "",
    ].join("\n")

    const { deltas, session, error } = parseSSEChunks(sseText)

    expect(deltas).toHaveLength(1)
    expect(session).toBeNull()
    expect(error).toBe("Analysis timed out after 5 minutes. Try a shorter transcript or click Retry.")
  })

  it("ignores malformed data lines without throwing", () => {
    const sseText = [
      "event: delta",
      "data: not-json",
      "",
      "event: done",
      `data: ${JSON.stringify(mockSession)}`,
      "",
    ].join("\n")

    const { deltas, session, error } = parseSSEChunks(sseText)
    expect(deltas).toHaveLength(0)
    expect(session).not.toBeNull()
    expect(error).toBeNull()
  })
})

describe("consumeSSEStream (ReadableStream integration)", () => {
  it("drains a mocked ReadableStream and assembles deltas + done session", async () => {
    const sseText = [
      "event: delta",
      `data: ${JSON.stringify({ text: "chunk1 " })}`,
      "",
      "event: delta",
      `data: ${JSON.stringify({ text: "chunk2" })}`,
      "",
      "event: done",
      `data: ${JSON.stringify(mockSession)}`,
      "",
    ].join("\n")

    const stream = buildSSEStream(sseText)
    const { deltas, session, error } = await consumeSSEStream(stream)

    expect(deltas.join("")).toBe("chunk1 chunk2")
    expect(session!.id).toBe("sess-1")
    expect(error).toBeNull()
  })

  it("returns error payload when stream carries an error event", async () => {
    const sseText = [
      "event: error",
      `data: ${JSON.stringify({ error: "Stream error during analysis" })}`,
      "",
    ].join("\n")

    const stream = buildSSEStream(sseText)
    const { session, error } = await consumeSSEStream(stream)

    expect(session).toBeNull()
    expect(error).toBe("Stream error during analysis")
  })
})
