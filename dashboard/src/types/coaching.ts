export interface CoachingSession {
  id: string
  application_id: string | null
  user_id: string
  session_type: "debrief" | "transcript" | "practice"
  raw_input: string
  ai_analysis: CoachingAnalysis
  overall_score: number
  strong_points: string[]
  improvements: CoachingImprovement[]
  patterns_detected: PatternAnalysis
  created_at: string
}

export interface CoachingAnalysis {
  summary: string
  question_analyses: QuestionAnalysis[]
}

export interface QuestionAnalysis {
  question: string
  your_answer: string
  score: number
  feedback: string
  coached_answer: string
  issues: string[]
}

export interface CoachingImprovement {
  area: string
  your_answer: string
  coached_answer: string
  tip: string
}

export interface PatternAnalysis {
  rambling: boolean
  hedging_count: number
  filler_words: Record<string, number>
  vague_answers: number
  missing_star: boolean
  specificity_score: number
  confidence_score: number
}

export interface PracticeQuestion {
  question: string
  type: "behavioral" | "technical" | "situational"
  difficulty: "easy" | "medium" | "hard"
  targets: string
}

export interface DebriefRecord {
  id: string
  application_id: string
  user_id: string
  stage: string
  went_well: string | null
  was_hard: string | null
  do_differently: string | null
  key_takeaways: string[] | null
  interviewer_names: string[] | null
  topics_covered: string[] | null
  overall_rating: number | null
  ai_analysis: CoachingAnalysis | null
  model_used: string | null
  generation_cost_cents: number
  created_at: string
}

export interface DebriefAiAnalysis {
  patterns: string[]
  strengths: string[]
  improvement_areas: string[]
  study_recommendations: string[]
  next_round_focus: string
}

export interface DebriefStats {
  total_debriefs: number
  average_rating: number | null
  most_recent_at: string | null
  debriefs_this_week: number
}
