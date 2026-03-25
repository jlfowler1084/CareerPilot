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
