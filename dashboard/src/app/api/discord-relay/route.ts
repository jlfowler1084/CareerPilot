import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"

// ── Types ──────────────────────────────────────────────────────────────────

interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

interface DiscordEmbed {
  title: string
  color: number
  fields: DiscordEmbedField[]
  footer: { text: string }
  timestamp: string
}

// ── Color map ──────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, number> = {
  "deployment.succeeded": 0x22c55e,
  "deployment.error":     0xef4444,
  "deployment.canceled":  0xeab308,
  "alerts.triggered":     0xf97316,
}
const DEFAULT_COLOR = 0x6b7280

// ── Human-readable titles ──────────────────────────────────────────────────

const EVENT_TITLES: Record<string, string> = {
  "deployment.succeeded": "Deployment Succeeded",
  "deployment.error":     "Deployment Error",
  "deployment.canceled":  "Deployment Canceled",
  "alerts.triggered":     "Alert Triggered",
}

// ── Helpers ────────────────────────────────────────────────────────────────

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha1", secret).update(body).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function formatTitle(eventType: string): string {
  if (EVENT_TITLES[eventType]) return EVENT_TITLES[eventType]
  // Unknown event: "some.event.type" → "Some Event Type"
  return eventType
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildEmbed(eventType: string, payload: Record<string, unknown>): DiscordEmbed {
  const color = EVENT_COLORS[eventType] ?? DEFAULT_COLOR
  const fields: DiscordEmbedField[] = []

  // Project name
  const projectName =
    (payload.name as string) ??
    ((payload.payload as Record<string, unknown>)?.name as string) ??
    ((payload.project as Record<string, unknown>)?.name as string) ??
    "Unknown"
  fields.push({ name: "Project", value: projectName, inline: true })

  // Branch + commit (deployment events nest under payload.deployment or payload)
  const deployment =
    (payload.deployment as Record<string, unknown>) ??
    ((payload.payload as Record<string, unknown>)?.deployment as Record<string, unknown>)

  if (deployment) {
    const meta = (deployment.meta as Record<string, unknown>) ?? {}
    const branch =
      (meta.githubCommitRef as string) ??
      (meta.gitlabCommitRef as string) ??
      (deployment.gitSource as Record<string, unknown>)?.ref as string | undefined
    const commit =
      (meta.githubCommitSha as string) ??
      (meta.gitlabCommitSha as string)

    if (branch) fields.push({ name: "Branch", value: branch, inline: true })
    if (commit) fields.push({ name: "Commit", value: commit.slice(0, 7), inline: true })

    const url = (deployment.url as string) ?? (deployment.inspectorUrl as string)
    if (url) {
      const displayUrl = url.startsWith("http") ? url : `https://${url}`
      fields.push({ name: "Deployment URL", value: displayUrl })
    }
  }

  // Alert-specific fields
  if (eventType === "alerts.triggered") {
    const alert =
      (payload.alert as Record<string, unknown>) ??
      ((payload.payload as Record<string, unknown>)?.alert as Record<string, unknown>) ??
      payload

    const alertName = (alert.name as string) ?? (alert.title as string)
    if (alertName) fields.push({ name: "Alert Name", value: alertName, inline: true })

    const alertMessage =
      (alert.message as string) ?? (alert.text as string) ?? (alert.details as string)
    if (alertMessage) fields.push({ name: "Details", value: alertMessage.slice(0, 1024) })

    const threshold = (alert.threshold as string | number) ?? (alert.limit as string | number)
    const metric = (alert.metric as string) ?? (alert.type as string)
    if (threshold !== undefined || metric) {
      const parts: string[] = []
      if (metric) parts.push(`Metric: ${metric}`)
      if (threshold !== undefined) parts.push(`Threshold: ${threshold}`)
      fields.push({ name: "Metric / Threshold", value: parts.join(" | "), inline: true })
    }
  }

  return {
    title: formatTitle(eventType),
    color,
    fields,
    footer: { text: "CareerPilot Vercel Webhook" },
    timestamp: new Date().toISOString(),
  }
}

// ── GET — health check ─────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ status: "ok", service: "discord-relay" })
}

// ── POST — receive Vercel webhook, relay to Discord ────────────────────────

export async function POST(req: NextRequest) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (!secret) {
    console.error("[discord-relay] VERCEL_WEBHOOK_SECRET is not configured")
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL
  if (!discordUrl) {
    console.error("[discord-relay] DISCORD_WEBHOOK_URL is not configured")
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  // Read body once for both verification and parsing
  const rawBody = await req.text()

  // Verify signature
  const signature = req.headers.get("x-vercel-signature") ?? ""
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // Parse payload
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventType = (payload.type as string) ?? "unknown"
  const embed = buildEmbed(eventType, payload)

  // Fire-and-forget Discord POST — don't let Discord failures cause a 500
  fetch(discordUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch((err) => {
    console.error("[discord-relay] Failed to post to Discord:", err)
  })

  return NextResponse.json({ received: true, event: eventType })
}
