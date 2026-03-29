import type { Job } from "@/types"

export interface SearchFilters {
  source: "all" | "Dice" | "Indeed"
  jobType: "all" | "Full-time" | "Contract" | "Part-time"
  location: "all" | "remote" | "onsite"
  hasSalary: boolean
  easyApplyOnly: boolean
  keyword: string
}

export const DEFAULT_FILTERS: SearchFilters = {
  source: "all",
  jobType: "all",
  location: "all",
  hasSalary: false,
  easyApplyOnly: false,
  keyword: "",
}

export function applyFilters(jobs: Job[], filters: SearchFilters): Job[] {
  return jobs.filter((job) => {
    if (filters.source !== "all" && job.source !== filters.source) return false

    if (filters.jobType !== "all") {
      const normalizedType = (job.type || "").toLowerCase()
      if (!normalizedType.includes(filters.jobType.toLowerCase())) return false
    }

    if (filters.location !== "all") {
      const loc = (job.location || "").toLowerCase()
      if (filters.location === "remote") {
        if (!loc.includes("remote")) return false
      } else if (filters.location === "onsite") {
        if (loc.includes("remote") || loc === "") return false
      }
    }

    if (filters.hasSalary) {
      if (!job.salary || job.salary === "Not listed" || job.salary.trim() === "") return false
    }

    if (filters.easyApplyOnly) {
      if (!job.easyApply) return false
    }

    if (filters.keyword.trim()) {
      const kw = filters.keyword.toLowerCase()
      const searchable = `${job.title} ${job.company} ${job.location}`.toLowerCase()
      if (!searchable.includes(kw)) return false
    }

    return true
  })
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.source !== "all" ||
    filters.jobType !== "all" ||
    filters.location !== "all" ||
    filters.hasSalary ||
    filters.easyApplyOnly ||
    filters.keyword.trim() !== ""
  )
}

export function countActiveFilters(filters: SearchFilters): number {
  let count = 0
  if (filters.source !== "all") count++
  if (filters.jobType !== "all") count++
  if (filters.location !== "all") count++
  if (filters.hasSalary) count++
  if (filters.easyApplyOnly) count++
  if (filters.keyword.trim()) count++
  return count
}
