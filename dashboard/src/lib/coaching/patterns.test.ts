import { describe, it, expect } from "vitest"
import { analyzeFillersAndPatterns } from "./patterns"

describe("analyzeFillersAndPatterns", () => {
  it("detects filler words", () => {
    const result = analyzeFillersAndPatterns(
      "Um, basically I think maybe we should, you know, sort of do that. Um."
    )
    expect(result.filler_words["um"]).toBe(2)
    expect(result.filler_words["basically"]).toBe(1)
    expect(result.filler_words["you know"]).toBe(1)
    expect(result.filler_words["sort of"]).toBe(1)
    expect(result.filler_words["i think maybe"]).toBe(1)
  })

  it("counts hedging phrases", () => {
    const result = analyzeFillersAndPatterns(
      "I guess it might be a good idea. I'm not sure but probably we should. Maybe not."
    )
    expect(result.hedging_count).toBeGreaterThanOrEqual(3)
  })

  it("detects rambling when over 300 words", () => {
    const short = analyzeFillersAndPatterns("This is a short answer about my experience.")
    expect(short.rambling).toBe(false)

    const long = analyzeFillersAndPatterns(Array(301).fill("word").join(" "))
    expect(long.rambling).toBe(true)
  })

  it("detects missing STAR format", () => {
    const noStar = analyzeFillersAndPatterns("I did some work on a project and it went well.")
    expect(noStar.missing_star).toBe(true)

    const hasStar = analyzeFillersAndPatterns(
      "The situation was that our servers were down. My task was to restore service. " +
      "The action I took was to restart the cluster. The result was 100% uptime after that."
    )
    expect(hasStar.missing_star).toBe(false)
  })

  it("scores specificity higher with technical terms and numbers", () => {
    const vague = analyzeFillersAndPatterns(
      "I worked on some infrastructure stuff and it was good."
    )
    const specific = analyzeFillersAndPatterns(
      "I managed 700 VMware VMs using PowerShell automation, reducing deployment time by 40%. " +
      "Built Splunk dashboards for SolarWinds monitoring across 3 data centers."
    )
    expect(specific.specificity_score).toBeGreaterThan(vague.specificity_score)
  })

  it("scores confidence lower with many fillers", () => {
    const confident = analyzeFillersAndPatterns(
      "I designed and deployed the Active Directory infrastructure for 500 users across Azure."
    )
    const hedgy = analyzeFillersAndPatterns(
      "Um, I guess I sort of maybe kind of worked on, you know, basically some stuff. " +
      "I'm not sure but I think maybe it was sort of related to, um, infrastructure I guess."
    )
    expect(confident.confidence_score).toBeGreaterThan(hedgy.confidence_score)
  })

  it("returns valid structure for empty input", () => {
    const result = analyzeFillersAndPatterns("")
    expect(result).toHaveProperty("rambling")
    expect(result).toHaveProperty("hedging_count")
    expect(result).toHaveProperty("filler_words")
    expect(result).toHaveProperty("vague_answers")
    expect(result).toHaveProperty("missing_star")
    expect(result).toHaveProperty("specificity_score")
    expect(result).toHaveProperty("confidence_score")
    expect(result.rambling).toBe(false)
    expect(result.specificity_score).toBeGreaterThanOrEqual(1)
    expect(result.confidence_score).toBeGreaterThanOrEqual(1)
  })

  it("counts vague answers (sentences without specifics)", () => {
    const result = analyzeFillersAndPatterns(
      "we worked on things that were important. it was a good experience overall. " +
      "the team was great and we did well together."
    )
    expect(result.vague_answers).toBeGreaterThanOrEqual(2)
  })
})
