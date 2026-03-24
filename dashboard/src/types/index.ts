export interface Job {
  title: string
  company: string
  location: string
  salary: string
  url: string
  posted: string
  type: string
  source: "Indeed" | "Dice"
  easyApply?: boolean
  profileId: string
  profileLabel: string
}

export interface Application {
  id: string
  user_id: string
  title: string
  company: string
  location: string | null
  url: string | null
  source: string | null
  salary_range: string | null
  status: ApplicationStatus
  job_type: string | null
  posted_date: string | null
  date_found: string
  date_applied: string | null
  date_response: string | null
  notes: string
  profile_id: string
  updated_at: string
  tailored_resume: string | null
}

export type ApplicationStatus =
  | "found"
  | "interested"
  | "applied"
  | "phone_screen"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "ghosted"

export interface ActivityEntry {
  id: string
  user_id: string
  action: string
  created_at: string
}

export interface SearchCacheEntry {
  id: string
  user_id: string
  profile_id: string
  results: Job[]
  result_count: number
  searched_at: string
}

export interface SearchRun {
  profileIds: string[]
  startedAt: string
  completedAt: string | null
  totalResults: number
  newResults: number
  aborted: boolean
}
