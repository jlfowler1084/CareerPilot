"use client"

import { useState, useCallback } from "react"

export interface JobDetails {
  title: string
  company: string
  location: string
  salary: string
  description: string
  requirements: string[]
  niceToHaves: string[]
  applyUrl: string
  source: string
  cached: boolean
  type?: string
  posted?: string
}

export function useJobDetails() {
  const [details, setDetails] = useState<JobDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDetails = useCallback(
    async (job: {
      url: string
      source: string
      jobId?: string
      summary?: string
      title?: string
      company?: string
      location?: string
      salary?: string
      type?: string
      posted?: string
    }) => {
      setIsLoading(true)
      setError(null)
      try {
        const resp = await fetch("/api/job-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job),
        })
        if (!resp.ok) throw new Error("Failed to fetch job details")
        const data = await resp.json()
        setDetails(data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const clearDetails = useCallback(() => {
    setDetails(null)
    setError(null)
  }, [])

  return { details, isLoading, error, fetchDetails, clearDetails }
}
