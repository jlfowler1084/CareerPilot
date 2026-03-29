import { parseSalary } from "@/lib/search-filter-utils"
import type { SkillInventoryItem, FitScore } from "@/types"

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TARGET_TITLES = [
  "systems administrator",
  "systems engineer",
  "infrastructure engineer",
  "devops engineer",
  "automation engineer",
  "powershell engineer",
  "cloud engineer",
]

const PARTIAL_MATCH_KEYWORDS = [
  "systems",
  "infrastructure",
  "engineer",
  "administrator",
  "devops",
  "automation",
  "powershell",
  "cloud",
]

const ADJACENT_MATCH_KEYWORDS = ["it", "sysadmin", "network", "server"]

// Negative signals — subtract 15 pts (floor 0)
const NEGATIVE_TITLE_SIGNALS = [
  "senior director",
  "vp",
  "vice president",
  "manager",
  "principal architect",
  "staff engineer",
  "lead",
  "intern",
  "junior",
  "entry level",
]

// Exceptions that override the negative signal check
const NEGATIVE_EXCEPTIONS = [
  "systems manager",
  "infrastructure manager",
  "systems lead",
  "infrastructure lead",
  "infra lead",
]

// Irrelevant domains — skip scoring entirely and return 0
const IRRELEVANT_SIGNALS = [
  "mechanical",
  "civil",
  "chemical",
  "construction",
  "hvac",
  "pest control",
  "transportation",
  "epc",
]

// Known tech skills to detect as "missing" from the inventory
const KNOWN_TECH_SKILLS = [
  "kubernetes",
  "docker",
  "terraform",
  "ansible",
  "aws",
  "azure",
  "gcp",
  "linux",
  "python",
  "java",
  "go",
  "rust",
  "ci/cd",
  "jenkins",
  "puppet",
  "chef",
  "salt",
  "nagios",
  "splunk",
  "datadog",
]

const INDY_METRO_TERMS = [
  "indianapolis",
  "indy",
  "carmel",
  "fishers",
  "noblesville",
  "sheridan",
  "westfield",
  "zionsville",
]

const MIDWEST_TERMS = [
  "ohio",
  ", oh",
  "illinois",
  ", il",
  "michigan",
  ", mi",
  "kentucky",
  ", ky",
]

// ─── Scoring helpers ─────────────────────────────────────────────────────────

function scoreTitle(
  jobTitle: string,
  targetTitles: string[]
): number {
  const lower = jobTitle.toLowerCase()

  // Irrelevant — bail immediately
  if (IRRELEVANT_SIGNALS.some((sig) => lower.includes(sig))) return 0

  // Start with base match score
  let base = 0

  // Exact match against target list
  if (targetTitles.some((t) => lower === t.toLowerCase())) {
    base = 30
  } else if (PARTIAL_MATCH_KEYWORDS.some((kw) => lower.includes(kw))) {
    base = 20
  } else if (ADJACENT_MATCH_KEYWORDS.some((kw) => lower.includes(kw))) {
    base = 10
  }

  // Negative signals
  const hasException = NEGATIVE_EXCEPTIONS.some((ex) => lower.includes(ex))
  if (!hasException) {
    // "manager" and "lead" only penalise when not in an exception
    const hasNegative = NEGATIVE_TITLE_SIGNALS.some((sig) => lower.includes(sig))
    if (hasNegative) {
      base = Math.max(0, base - 15)
    }
  }

  return base
}

function scoreSkills(
  jobTitle: string,
  company: string,
  skills: SkillInventoryItem[]
): { points: number; matchedSkills: string[]; missingSkills: string[] } {
  if (skills.length === 0) {
    return { points: 20, matchedSkills: [], missingSkills: [] }
  }

  const searchText = `${jobTitle} ${company}`.toLowerCase()

  const matchedSkills: string[] = []
  let totalWeight = 0

  for (const skill of skills) {
    const nameLower = skill.skill_name.toLowerCase()
    const aliasMatch = skill.aliases.some((a) => searchText.includes(a.toLowerCase()))
    if (searchText.includes(nameLower) || aliasMatch) {
      matchedSkills.push(skill.skill_name)
      totalWeight += skill.weight
    }
  }

  // maxPossibleWeight = sum of weights of the top 5 skills by weight
  const sortedWeights = [...skills].sort((a, b) => b.weight - a.weight)
  const top5 = sortedWeights.slice(0, 5)
  const maxPossibleWeight = top5.reduce((sum, s) => sum + s.weight, 0)

  const points =
    maxPossibleWeight > 0
      ? Math.min(40, Math.round((totalWeight / maxPossibleWeight) * 40))
      : 0

  // Missing skills: known tech keywords in job title that aren't in inventory
  const inventoryTerms = new Set<string>()
  for (const skill of skills) {
    inventoryTerms.add(skill.skill_name.toLowerCase())
    for (const alias of skill.aliases) {
      inventoryTerms.add(alias.toLowerCase())
    }
  }

  const titleLower = jobTitle.toLowerCase()
  const missingSkills: string[] = []
  for (const tech of KNOWN_TECH_SKILLS) {
    if (titleLower.includes(tech) && !inventoryTerms.has(tech)) {
      missingSkills.push(tech)
    }
  }

  return { points, matchedSkills, missingSkills }
}

function scoreLocation(
  location: string,
  preferredLocations?: string[]
): number {
  if (!location || location.trim() === "") return 8

  const lower = location.toLowerCase()

  // User-provided preferred locations override everything
  if (preferredLocations && preferredLocations.length > 0) {
    if (preferredLocations.some((pl) => lower.includes(pl.toLowerCase()))) return 15
    return 0
  }

  if (lower.includes("remote") || lower.includes("work from home")) return 15
  if (INDY_METRO_TERMS.some((t) => lower.includes(t))) return 15
  if (lower.includes("indiana") || lower.includes(", in")) return 10
  if (MIDWEST_TERMS.some((t) => lower.includes(t))) return 5

  return 0
}

function scoreSalary(
  salary: string,
  salaryMin: number,
  salaryMax: number
): number {
  const parsed = parseSalary(salary)

  if (!parsed) return 8 // neutral — not listed or unparseable

  const { annual } = parsed

  if (annual >= salaryMin && annual <= salaryMax) return 15
  if (annual > salaryMax) return 15
  if (annual >= 70000 && annual < salaryMin) return 10
  if (annual >= 50000 && annual < 70000) return 5
  return 0
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function scoreJob(
  job: {
    title: string
    company: string
    location: string
    salary: string
    source: string
    easyApply?: boolean
    type?: string
  },
  skills: SkillInventoryItem[],
  options?: {
    targetTitles?: string[]
    salaryMin?: number
    salaryMax?: number
    preferredLocations?: string[]
  }
): FitScore {
  const targetTitles = options?.targetTitles ?? DEFAULT_TARGET_TITLES
  const salaryMin = options?.salaryMin ?? 90000
  const salaryMax = options?.salaryMax ?? 130000

  // Title — irrelevant jobs short-circuit to zero
  const titleLower = job.title.toLowerCase()
  if (IRRELEVANT_SIGNALS.some((sig) => titleLower.includes(sig))) {
    return {
      total: 0,
      breakdown: { title: 0, skills: 0, location: 0, salary: 0 },
      matchedSkills: [],
      missingSkills: [],
      easyApply: job.easyApply ?? false,
    }
  }

  const titlePts = scoreTitle(job.title, targetTitles)
  const { points: skillsPts, matchedSkills, missingSkills } = scoreSkills(
    job.title,
    job.company,
    skills
  )
  const locationPts = scoreLocation(job.location, options?.preferredLocations)
  const salaryPts = scoreSalary(job.salary, salaryMin, salaryMax)

  const total = Math.min(100, Math.max(0, titlePts + skillsPts + locationPts + salaryPts))

  return {
    total,
    breakdown: {
      title: titlePts,
      skills: skillsPts,
      location: locationPts,
      salary: salaryPts,
    },
    matchedSkills,
    missingSkills,
    easyApply: job.easyApply ?? false,
  }
}
