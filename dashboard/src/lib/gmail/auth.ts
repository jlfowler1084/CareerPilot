import { google } from "googleapis"
import * as fs from "fs"
import * as path from "path"

// CAR-198: Single source of truth — read token from the same file the CLI writes.
// GMAIL_TOKEN_FILE env override allows explicit path configuration (e.g. in tests).
// Default: one level up from the dashboard dir (repo root) → data/gmail_token.json.
function resolveTokenPath(): string {
  if (process.env.GMAIL_TOKEN_FILE) {
    return process.env.GMAIL_TOKEN_FILE
  }
  return path.resolve(process.cwd(), "..", "data", "gmail_token.json")
}

interface GmailTokenFile {
  token?: string
  refresh_token?: string
  token_uri?: string
  client_id?: string
  client_secret?: string
  scopes?: string[]
  expiry?: string
}

export function getGmailClient() {
  const tokenPath = resolveTokenPath()

  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Gmail token file not found at ${tokenPath}. Run 'python -m cli auth gmail' on the CLI to authenticate.`
    )
  }

  const raw = fs.readFileSync(tokenPath, "utf-8")
  const tokenData: GmailTokenFile = JSON.parse(raw)

  const refreshToken = tokenData.refresh_token
  if (!refreshToken) {
    throw new Error(
      `Token file at ${tokenPath} is missing the refresh_token field. Re-run CLI auth.`
    )
  }

  // Client credentials come from the token file (written by CLI auth flow).
  // Fall back to env vars so the calendar-sync route's GOOGLE_CLIENT_ID/SECRET
  // pair continues to work when this module is imported in mixed contexts.
  const clientId = tokenData.client_id ?? process.env.GOOGLE_CLIENT_ID
  const clientSecret = tokenData.client_secret ?? process.env.GOOGLE_CLIENT_SECRET

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  return google.gmail({ version: "v1", auth: oauth2Client })
}
