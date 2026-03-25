"use client"

import { useState } from "react"
import {
  Loader2,
  ArrowRight,
  Send,
  RotateCcw,
  Save,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"
import type { PracticeQuestion, QuestionAnalysis, PatternAnalysis } from "@/types"

interface PracticeModeProps {
  applicationId: string
  onStartPractice: (jobDescription?: string) => Promise<PracticeQuestion[] | null>
  onEvaluate: (question: string, answer: string, jobDescription?: string) => Promise<{ evaluation: QuestionAnalysis; patterns: PatternAnalysis } | null>
  onSaveSession: (notes: string, jobDescription?: string) => Promise<unknown>
  practicing: boolean
  evaluating: boolean
}

interface AnswerResult {
  evaluation: QuestionAnalysis
  patterns: PatternAnalysis
}

const ISSUE_COLORS: Record<string, string> = {
  rambling: "bg-orange-100 text-orange-700",
  hedging: "bg-yellow-100 text-yellow-700",
  vague: "bg-red-100 text-red-700",
  "off-topic": "bg-purple-100 text-purple-700",
  "no-star": "bg-blue-100 text-blue-700",
  "technical-gap": "bg-rose-100 text-rose-700",
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-emerald-600"
  if (score >= 4) return "text-amber-500"
  return "text-red-500"
}

export function PracticeMode({
  applicationId,
  onStartPractice,
  onEvaluate,
  onSaveSession,
  practicing,
  evaluating,
}: PracticeModeProps) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState("")
  const [results, setResults] = useState<(AnswerResult | null)[]>([])
  const [showSummary, setShowSummary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [started, setStarted] = useState(false)

  async function handleStart() {
    const qs = await onStartPractice()
    if (qs && qs.length > 0) {
      setQuestions(qs)
      setResults(new Array(qs.length).fill(null))
      setCurrentIndex(0)
      setAnswer("")
      setShowSummary(false)
      setStarted(true)
    }
  }

  async function handleSubmit() {
    if (!answer.trim()) return
    const q = questions[currentIndex]
    const result = await onEvaluate(q.question, answer)
    if (result) {
      const newResults = [...results]
      newResults[currentIndex] = result
      setResults(newResults)
    }
  }

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setAnswer("")
    } else {
      setShowSummary(true)
    }
  }

  async function handleSave() {
    setSaving(true)
    const practiceLog = questions.map((q, i) => {
      const r = results[i]
      return `Q: ${q.question}\nA: ${r?.evaluation?.your_answer || "(skipped)"}\nScore: ${r?.evaluation?.score || "N/A"}/10`
    }).join("\n\n")

    await onSaveSession(practiceLog)
    toast.success("Practice session saved")
    setSaving(false)
  }

  function handleReset() {
    setQuestions([])
    setResults([])
    setCurrentIndex(0)
    setAnswer("")
    setShowSummary(false)
    setStarted(false)
  }

  // Not started yet
  if (!started) {
    return (
      <button
        onClick={handleStart}
        disabled={practicing}
        className="flex items-center gap-2 w-full justify-center py-3 rounded-lg border border-dashed border-blue-300 text-blue-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
      >
        {practicing ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs font-semibold">Generating questions...</span>
          </>
        ) : (
          <span className="text-xs font-semibold">Start Practice Session</span>
        )}
      </button>
    )
  }

  // Summary view
  if (showSummary) {
    const completedResults = results.filter(Boolean) as AnswerResult[]
    const avgScore = completedResults.length > 0
      ? Math.round(completedResults.reduce((sum, r) => sum + (r.evaluation.score || 0), 0) / completedResults.length)
      : 0

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-zinc-600">Practice Summary</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 bg-blue-50 rounded"
            >
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
              Save Session
            </button>
            <button
              onClick={handleReset}
              className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-700 flex items-center gap-1"
            >
              <RotateCcw size={10} />
              New Session
            </button>
          </div>
        </div>

        <div className="bg-zinc-50 rounded-lg p-3 flex items-center gap-3">
          <span className={`text-3xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</span>
          <div>
            <p className="text-xs font-semibold text-zinc-700">Average Score</p>
            <p className="text-[10px] text-zinc-500">{completedResults.length}/{questions.length} questions answered</p>
          </div>
        </div>

        {completedResults.map((r, i) => (
          <div key={i} className="border border-zinc-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className={`text-xs font-bold ${scoreColor(r.evaluation.score)}`}>{r.evaluation.score}/10</span>
            <span className="text-xs text-zinc-600 flex-1 truncate">{r.evaluation.question}</span>
            {r.evaluation.issues?.map((issue) => (
              <span key={issue} className={`text-[10px] px-1 py-0.5 rounded ${ISSUE_COLORS[issue] || "bg-zinc-100 text-zinc-600"}`}>
                {issue}
              </span>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // Active question
  const currentQ = questions[currentIndex]
  const currentResult = results[currentIndex]

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold text-zinc-400">
          Question {currentIndex + 1} of {questions.length}
        </p>
        <div className="flex-1 h-1 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          currentQ.difficulty === "hard" ? "bg-red-100 text-red-600" :
          currentQ.difficulty === "medium" ? "bg-amber-100 text-amber-600" :
          "bg-green-100 text-green-600"
        }`}>
          {currentQ.difficulty}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
          {currentQ.type}
        </span>
      </div>

      {/* Question */}
      <div className="bg-zinc-50 rounded-lg p-3">
        <p className="text-sm font-medium text-zinc-800">{currentQ.question}</p>
        <p className="text-[10px] text-zinc-400 mt-1">Tests: {currentQ.targets}</p>
      </div>

      {/* Answer input or result */}
      {!currentResult ? (
        <div className="space-y-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here... Speak naturally, as you would in an interview."
            className="w-full h-32 text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-300 text-zinc-700"
          />
          <button
            onClick={handleSubmit}
            disabled={evaluating || !answer.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {evaluating ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                <Send size={12} />
                Submit Answer
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Score */}
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className={scoreColor(currentResult.evaluation.score)} />
            <span className={`text-sm font-bold ${scoreColor(currentResult.evaluation.score)}`}>
              {currentResult.evaluation.score}/10
            </span>
            {currentResult.evaluation.issues?.map((issue) => (
              <span key={issue} className={`text-[10px] px-1.5 py-0.5 rounded ${ISSUE_COLORS[issue] || "bg-zinc-100 text-zinc-600"}`}>
                {issue}
              </span>
            ))}
          </div>

          {/* Feedback */}
          <p className="text-xs text-zinc-600">{currentResult.evaluation.feedback}</p>

          {/* Coached answer */}
          <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5">
            <p className="text-[10px] font-semibold text-emerald-600 mb-1">Better Answer</p>
            <p className="text-xs text-emerald-800">{currentResult.evaluation.coached_answer}</p>
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors"
          >
            {currentIndex < questions.length - 1 ? (
              <>
                Next Question
                <ArrowRight size={12} />
              </>
            ) : (
              "View Summary"
            )}
          </button>
        </div>
      )}
    </div>
  )
}
