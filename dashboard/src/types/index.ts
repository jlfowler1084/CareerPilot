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
  interview_date: string | null
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

// Conversation types
export type ConversationType =
  | "phone"
  | "video"
  | "email"
  | "in_person"
  | "chat"
  | "note"

export interface ConversationPerson {
  name: string
  role?: string
  email?: string
  phone?: string
}

export interface QuestionAsked {
  question: string
  your_answer: string
  quality_rating?: number
}

export interface QuestionYouAsked {
  question: string
  their_response: string
}

export interface ActionItem {
  task: string
  due_date?: string
  completed: boolean
}

export interface Conversation {
  id: string
  application_id: string
  user_id: string
  conversation_type: ConversationType
  title: string | null
  people: ConversationPerson[]
  date: string
  duration_minutes: number | null
  notes: string | null
  questions_asked: QuestionAsked[]
  questions_you_asked: QuestionYouAsked[]
  action_items: ActionItem[]
  topics: string[]
  sentiment: number | null
  transcript_url: string | null
  ai_analysis: Record<string, unknown> | null
  created_at: string
  updated_at: string
  // Joined fields (from queries)
  application?: Pick<Application, "id" | "title" | "company">
}

export interface ConversationPattern {
  recurring_questions: Array<{ question: string; companies: string[]; count: number }>
  strongest_topics: Array<{ topic: string; avg_sentiment: number; count: number }>
  weak_areas: Array<{ area: string; suggestion: string }>
  this_week: string
}

export type {
  Email,
  EmailCategory,
  ClassificationResult,
  EmailApplicationLink,
  UserSettings,
} from "./email"
