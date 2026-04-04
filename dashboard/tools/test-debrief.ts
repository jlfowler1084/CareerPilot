/**
 * Test script for debrief analysis against a real interview transcript.
 * Replicates the exact logic from coaching/analyze/route.ts.
 *
 * Usage: npx tsx tools/test-debrief.ts [path-to-transcript]
 */
import { readFileSync } from "fs"
import { config } from "dotenv"
import { sanitizeJsonResponse, parseJsonResponse } from "../src/lib/json-utils"

// Load .env.local for ANTHROPIC_API_KEY
config({ path: ".env.local" })

const COACHING_SYSTEM_PROMPT = `You are an interview performance coach analyzing a candidate's interview performance. The candidate is Joseph Fowler, a systems administrator/engineer with 20+ years of experience.

Analyze the provided interview content. Respond with raw JSON only. No markdown formatting, no code fences, no preamble, no explanation.

Return a JSON object with:
{
  "summary": "2-3 sentence overall assessment",
  "overall_score": <1-10>,
  "strong_points": ["specific strength 1", "specific strength 2"],
  "question_analyses": [
    {
      "question": "the question that was asked (infer from context)",
      "your_answer": "what the candidate said (quoted/paraphrased)",
      "score": <1-10>,
      "feedback": "specific, actionable feedback",
      "coached_answer": "rewritten version that's concise, specific, uses STAR format where appropriate, and demonstrates competence",
      "issues": ["rambling", "hedging", "vague", "off-topic", "no-star", "technical-gap"]
    }
  ],
  "improvements": [
    {
      "area": "category of improvement",
      "your_answer": "what they said",
      "coached_answer": "better version",
      "tip": "one-line actionable tip"
    }
  ],
  "top_3_focus_areas": ["most important thing to work on", "second", "third"]
}

Rules:
- Be direct and specific — no generic advice like 'be more confident'
- Every coached answer must use real details from Joseph's actual experience (PowerShell, VMware 700+ VMs, Splunk dashboards, SolarWinds, Active Directory, Azure)
- Flag answers that sound good but lack substance
- If a question is about a skill gap, coach how to acknowledge it honestly while showing initiative
- STAR format: Situation, Task, Action, Result — flag when missing
- Keep coached answers under 60 seconds speaking time (~150 words)

Return ONLY valid JSON. No markdown, no backticks, no preamble.`

async function main() {
  const transcriptPath = process.argv[2] || "C:\\Users\\Joe\\Desktop\\FW_ MISO Interview_Systems Administrator Role _otter_ai.txt"

  console.log("=== Debrief Analysis Test ===")
  console.log(`Transcript: ${transcriptPath}`)

  const rawInput = readFileSync(transcriptPath, "utf-8")
  console.log(`Transcript size: ${rawInput.length} chars`)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY not found in .env.local")
    process.exit(1)
  }

  // Build the same prompt as the route
  const contextParts: string[] = [
    `Session type: debrief`,
    `\nCandidate's input:\n${rawInput}`,
  ]
  const userMessage = contextParts.join("\n")
  console.log(`User message size: ${userMessage.length} chars`)

  // Call Claude API — same params as the route
  console.log("\n--- Calling Claude API ---")
  const maxTokens = 8192
  console.log(`Model: ${process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001"}`)
  console.log(`max_tokens: ${maxTokens}`)

  const startTime = Date.now()
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: COACHING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const elapsed = Date.now() - startTime

  if (!resp.ok) {
    const errBody = await resp.text()
    console.error(`API ERROR: ${resp.status}`)
    console.error(errBody)
    process.exit(1)
  }

  const data = await resp.json()

  // Diagnostic output
  console.log(`\n--- API Response Metadata ---`)
  console.log(`stop_reason: ${data.stop_reason}`)
  console.log(`usage: input=${data.usage?.input_tokens}, output=${data.usage?.output_tokens}`)
  console.log(`elapsed: ${elapsed}ms`)
  console.log(`model: ${data.model}`)

  const textBlock = data.content?.find((c: { type: string }) => c.type === "text")
  const finalText: string = textBlock?.text || ""

  console.log(`\n--- Raw Response ---`)
  console.log(`Length: ${finalText.length} chars`)
  console.log(`First 500 chars:\n${finalText.substring(0, 500)}`)
  console.log(`\nLast 200 chars:\n${finalText.substring(finalText.length - 200)}`)

  // Show hex of first 30 bytes to spot invisible chars
  console.log(`\nFirst 30 bytes (hex): ${Buffer.from(finalText.substring(0, 30)).toString("hex")}`)

  // Truncation check
  if (data.stop_reason === "max_tokens") {
    console.error("\n*** TRUNCATED: stop_reason is max_tokens ***")
  } else {
    console.log(`\nstop_reason OK: ${data.stop_reason}`)
  }

  // Run sanitizer
  console.log(`\n--- Sanitizer Output ---`)
  const sanitized = sanitizeJsonResponse(finalText)
  console.log(`Sanitized length: ${sanitized.length} chars`)
  console.log(`First 200 chars:\n${sanitized.substring(0, 200)}`)
  console.log(`Last 100 chars:\n${sanitized.substring(sanitized.length - 100)}`)

  // Parse JSON
  console.log(`\n--- JSON Parse ---`)
  try {
    const parsed = parseJsonResponse(finalText)
    console.log("SUCCESS: JSON parsed")
    console.log(`Keys: ${Object.keys(parsed as Record<string, unknown>).join(", ")}`)
    const p = parsed as Record<string, unknown>
    if (Array.isArray(p.question_analyses)) {
      console.log(`question_analyses count: ${p.question_analyses.length}`)
    }
    if (Array.isArray(p.improvements)) {
      console.log(`improvements count: ${p.improvements.length}`)
    }
    if (Array.isArray(p.top_3_focus_areas)) {
      console.log(`top_3_focus_areas: ${JSON.stringify(p.top_3_focus_areas)}`)
    }
    console.log(`overall_score: ${p.overall_score}`)
    console.log(`summary: ${(p.summary as string)?.substring(0, 150)}...`)
  } catch (e) {
    console.error(`FAILED: ${(e as Error).message}`)
    process.exit(1)
  }

  console.log("\n=== TEST PASSED ===")
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
