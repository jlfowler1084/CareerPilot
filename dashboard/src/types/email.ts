export type EmailCategory =
  | "recruiter_outreach"
  | "interview_request"
  | "follow_up"
  | "offer"
  | "job_alert"
  | "rejection"
  | "irrelevant"
  | "unclassified"

export interface ClassificationResult {
  category: Exclude<EmailCategory, "unclassified">
  company: string | null
  role: string | null
  urgency: "high" | "medium" | "low"
  summary: string
}

export interface Email {
  id: string
  user_id: string
  gmail_id: string
  thread_id: string | null
  from_email: string
  from_name: string | null
  from_domain: string | null
  to_email: string | null
  subject: string | null
  body_preview: string | null
  received_at: string
  category: EmailCategory
  classification_json: ClassificationResult | null
  suggested_application_id: string | null
  is_read: boolean
  dismissed: boolean
  replied_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailApplicationLink {
  email_id: string
  application_id: string
  user_id: string
  linked_by: "manual" | "confirmed_suggestion"
  linked_at: string
}

export interface UserSettings {
  user_id: string
  last_email_scan: string | null
  created_at: string
  updated_at: string
}
