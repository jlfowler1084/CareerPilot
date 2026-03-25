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
  interview_date: string | null
  follow_up_date: string | null
  calendar_event_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_role: string | null
  job_description: string | null
}

export type ApplicationEventType =
  | "status_change"
  | "note_added"
  | "resume_tailored"
  | "calendar_scheduled"
  | "contact_added"
  | "follow_up"
  | "tracked"

export interface ApplicationEvent {
  id: string
  application_id: string
  user_id: string
  event_type: ApplicationEventType
  previous_value: string | null
  new_value: string | null
  description: string
  created_at: string
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

export interface ExtractedJob {
  title: string
  company: string
  location: string | null
  salary_range: string | null
  job_type: string | null
  job_description: string | null
  contact_name: string | null
  contact_email: string | null
  posted_date: string | null
  source: string
  key_requirements: string[]
  nice_to_haves: string[]
  fit_analysis: string | null
}

export interface SearchRun {
  profileIds: string[]
  startedAt: string
  completedAt: string | null
  totalResults: number
  newResults: number
  aborted: boolean
}
