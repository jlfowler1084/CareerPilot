import type { PatternAnalysis } from "@/types/coaching"

const FILLER_WORDS = [
  "um", "uh", "like", "you know", "basically", "kind of", "sort of",
  "i think maybe", "i'm not sure but", "i guess", "actually", "literally",
  "right", "so yeah", "i mean",
]

const HEDGING_PHRASES = [
  "i think maybe",
  "i'm not sure but",
  "i guess",
  "probably",
  "maybe",
  "sort of",
  "kind of",
  "i suppose",
  "not really sure",
  "i don't know if",
  "it might be",
  "possibly",
]

const STAR_KEYWORDS = ["situation", "task", "action", "result"]

export function analyzeFillersAndPatterns(text: string): PatternAnalysis {
  const lower = text.toLowerCase()
  const words = lower.split(/\s+/)
  const wordCount = words.length

  // Count filler words
  const fillerCounts: Record<string, number> = {}
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${escapeRegex(filler)}\\b`, "gi")
    const matches = lower.match(regex)
    if (matches && matches.length > 0) {
      fillerCounts[filler] = matches.length
    }
  }

  // Count hedging phrases
  let hedgingCount = 0
  for (const phrase of HEDGING_PHRASES) {
    const regex = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "gi")
    const matches = lower.match(regex)
    if (matches) {
      hedgingCount += matches.length
    }
  }

  // Detect rambling: answers over 300 words suggest rambling
  const rambling = wordCount > 300

  // Detect vague answers: count sentences without specifics
  // (numbers, proper nouns, technical terms)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10)
  let vagueCount = 0
  for (const sentence of sentences) {
    const hasNumber = /\d+/.test(sentence)
    const hasSpecific = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/.test(sentence)
    const hasTechnical = /\b(?:API|SQL|AWS|Azure|Docker|Kubernetes|VM|DNS|LDAP|GPO|PowerShell|Python|Linux|Windows|Active Directory|VMware|Splunk|SolarWinds|CI\/CD|REST|SSH|TCP|UDP|HTTP|HTTPS|SSL|TLS)\b/i.test(sentence)
    if (!hasNumber && !hasSpecific && !hasTechnical) {
      vagueCount++
    }
  }

  // Check for STAR format usage
  const starCount = STAR_KEYWORDS.filter((kw) =>
    new RegExp(`\\b${kw}\\b`, "i").test(lower)
  ).length
  const missingStar = starCount < 3

  // Specificity score: based on concrete details
  const numberCount = (lower.match(/\d+/g) || []).length
  const technicalTermCount = (lower.match(/\b(?:API|SQL|AWS|Azure|Docker|Kubernetes|VM|DNS|LDAP|GPO|PowerShell|Python|Linux|Windows|Active Directory|VMware|Splunk|SolarWinds|CI\/CD|REST|SSH|TCP|UDP|HTTP|HTTPS|SSL|TLS)\b/gi) || []).length
  const specificityRaw = Math.min(10, Math.round(
    (numberCount * 1.5 + technicalTermCount * 2 + (sentences.length - vagueCount) * 0.5)
  ))
  const specificityScore = Math.max(1, specificityRaw)

  // Confidence score: inverse of hedging density
  const totalFillers = Object.values(fillerCounts).reduce((a, b) => a + b, 0)
  const fillerDensity = wordCount > 0 ? (totalFillers + hedgingCount) / wordCount : 0
  const confidenceScore = Math.max(1, Math.min(10, Math.round(10 - fillerDensity * 100)))

  return {
    rambling,
    hedging_count: hedgingCount,
    filler_words: fillerCounts,
    vague_answers: vagueCount,
    missing_star: missingStar,
    specificity_score: specificityScore,
    confidence_score: confidenceScore,
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
