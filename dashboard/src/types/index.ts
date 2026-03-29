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

// Interview Prep types
export interface SalaryRange {
  low: number
  mid: number
  high: number
  target?: number
  source: string
}

export interface StarStory {
  title: string
  situation: string
  task: string
  action: string
  result: string
}

export interface PhoneScreenContent {
  company_quick_hits: string[]
  elevator_pitch: string
  likely_questions: string[]
  talking_points: string[]
  questions_to_ask: string[]
  red_flags: string[]
  salary_prep: SalaryRange
  skills_to_study: string[]
}

export interface InterviewContent {
  technical_deep_dive: string[]
  scenario_questions: string[]
  star_stories: StarStory[]
  hands_on_prep: string[]
  architecture_questions: string[]
  knowledge_refresh: string[]
  skills_to_study: string[]
}

export interface OfferContent {
  salary_analysis: SalaryRange
  negotiation_scripts: string[]
  benefits_checklist: string[]
  counter_offer_framework: { initial: string; walkaway: string; strategy: string }
  decision_matrix: { factors: string[]; weights: Record<string, number> }
}

export interface PrepStage<T> {
  generated_at: string
  content: T
}

export interface Debrief {
  round: number
  date: string
  rating: number
  questions_asked: string
  went_well: string
  challenging: string
  takeaways: string
  interviewer_name: string
  interviewer_role: string
}

export interface InterviewPrep {
  phone_screen?: PrepStage<PhoneScreenContent>
  interview?: PrepStage<InterviewContent>
  offer?: PrepStage<OfferContent>
  debriefs?: Debrief[]
}

export type PrepStageKey = "phone_screen" | "interview" | "offer"

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
  cover_letter: string | null
  interview_date: string | null
  follow_up_date: string | null
  calendar_event_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_role: string | null
  job_description: string | null
  interview_prep?: InterviewPrep
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

export type ApplicationEventType =
  | "status_change"
  | "note_added"
  | "resume_tailored"
  | "calendar_scheduled"
  | "contact_added"
  | "cover_letter_generated"
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
  search_run_id?: string
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
  id: string
  user_id: string
  profiles_used: string[]
  total_results: number
  indeed_count: number
  dice_count: number
  new_count: number
  created_at: string
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

// ─── Fit Scoring & Auto-Apply Queue (CAR-18) ────────

export interface SkillInventoryItem {
  id: string
  user_id: string
  skill_name: string
  category: "core" | "strong" | "growing" | "familiar"
  weight: number
  years_experience: number | null
  aliases: string[]
  created_at: string
}

export interface FitScore {
  total: number // 0-100
  breakdown: {
    title: number   // 0-30
    skills: number  // 0-40
    location: number // 0-15
    salary: number  // 0-15
  }
  matchedSkills: string[]
  missingSkills: string[]
  easyApply: boolean
}

export type AutoApplyStatus =
  | "pending"
  | "approved"
  | "generating"
  | "ready"
  | "applying"
  | "applied"
  | "failed"
  | "skipped"
  | "rejected"

export interface AutoApplyQueueItem {
  id: string
  user_id: string
  job_title: string
  company: string
  location: string | null
  salary: string | null
  job_url: string | null
  source: string | null
  easy_apply: boolean
  fit_score: number
  score_breakdown: {
    title: number
    skills: number
    location: number
    salary: number
  }
  status: AutoApplyStatus
  tailored_resume_url: string | null
  cover_letter_url: string | null
  application_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type {
  Email,
  EmailCategory,
  ClassificationResult,
  EmailApplicationLink,
  UserSettings,
} from "./email"

export type {
  CoachingSession,
  CoachingAnalysis,
  QuestionAnalysis,
  CoachingImprovement,
  PatternAnalysis,
  PracticeQuestion,
} from "./coaching"
