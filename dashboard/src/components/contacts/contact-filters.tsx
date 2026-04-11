"use client"

import { Search } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ROLE_OPTIONS = [
  { value: "", label: "All Roles" },
  { value: "recruiter", label: "Recruiter" },
  { value: "hiring_manager", label: "Hiring Manager" },
  { value: "interviewer", label: "Interviewer" },
  { value: "hr", label: "HR" },
  { value: "referral", label: "Referral" },
]

const RECENCY_OPTIONS = [
  { value: "", label: "All Time" },
  { value: "active", label: "Active (14d)" },
  { value: "recent", label: "Recent (15–60d)" },
  { value: "dormant", label: "Dormant (61–180d)" },
  { value: "inactive", label: "Inactive (180d+)" },
]

interface ContactFiltersProps {
  search: string
  role: string
  recency: string
  onSearchChange: (value: string) => void
  onRoleChange: (value: string) => void
  onRecencyChange: (value: string) => void
  totalCount: number
  filteredCount: number
}

export function ContactFilters({
  search,
  role,
  recency,
  onSearchChange,
  onRoleChange,
  onRecencyChange,
  totalCount,
  filteredCount,
}: ContactFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search contacts..."
          className="w-full text-sm border border-zinc-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
        />
      </div>

      {/* Role filter */}
      <Select value={role || undefined} onValueChange={(v) => onRoleChange(v ?? "")}>
        <SelectTrigger className="min-w-[140px] text-sm">
          <SelectValue placeholder="All Roles" />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value || "__all__"}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Recency filter */}
      <Select value={recency || undefined} onValueChange={(v) => onRecencyChange(v ?? "")}>
        <SelectTrigger className="min-w-[160px] text-sm">
          <SelectValue placeholder="All Time" />
        </SelectTrigger>
        <SelectContent>
          {RECENCY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value || "__all__"}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Count */}
      <span className="text-xs text-zinc-400 ml-auto">
        {filteredCount} of {totalCount}
      </span>
    </div>
  )
}
