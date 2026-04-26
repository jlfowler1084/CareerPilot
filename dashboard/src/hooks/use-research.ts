"use client"

import { useEffect, useRef, useState } from "react"

export interface ResearchFound {
  found: true
  slug: string
  filename: string
  date: string
  markdown: string
}

export interface ResearchMissing {
  found: false
  slug: string
  hint: string
}

export type ResearchData = ResearchFound | ResearchMissing | null

// Pure helper extracted for testability. The /api/research route returns 404
// in two semantically different cases:
//   - "no research file" → JSON body has shape { found: false, slug, hint }
//   - "application not found" → JSON body has shape { error: "..." }
// This function classifies the body so the caller can branch correctly.
export function classifyResearch404(
  body: unknown
): { kind: "missing"; data: ResearchMissing } | { kind: "error"; message: string } {
  if (
    body &&
    typeof body === "object" &&
    "found" in body &&
    (body as { found?: unknown }).found === false
  ) {
    const b = body as { slug?: string; hint?: string }
    return {
      kind: "missing",
      data: { found: false, slug: b.slug ?? "", hint: b.hint ?? "" },
    }
  }
  const errorMsg =
    body && typeof body === "object" && "error" in body
      ? String((body as { error?: unknown }).error ?? "Application not found")
      : "Application not found"
  return { kind: "error", message: errorMsg }
}

export function useResearch(applicationId: string | null, enabled: boolean = true) {
  const [data, setData] = useState<ResearchData>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)

  // Reset fetch tracking when applicationId changes
  useEffect(() => {
    hasFetched.current = false
  }, [applicationId])

  useEffect(() => {
    if (!applicationId) {
      setData(null)
      setLoading(false)
      return
    }

    if (!enabled || hasFetched.current) {
      if (!enabled) setLoading(false)
      return
    }
    hasFetched.current = true

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const resp = await fetch(`/api/research/${applicationId}`)
        if (cancelled) return

        if (resp.status === 401) {
          setError("Unauthorized")
          setLoading(false)
          return
        }
        if (resp.status === 404) {
          const body = await resp.json()
          const classified = classifyResearch404(body)
          if (classified.kind === "missing") {
            setData(classified.data)
          } else {
            setError(classified.message)
          }
          setLoading(false)
          return
        }
        if (!resp.ok) {
          setError(`Research fetch failed: ${resp.status}`)
          setLoading(false)
          return
        }

        const body = await resp.json()
        if (cancelled) return
        setData(body as ResearchData)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unknown error")
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [applicationId, enabled])

  const hasResearch = data?.found === true

  return { data, loading, error, hasResearch }
}
