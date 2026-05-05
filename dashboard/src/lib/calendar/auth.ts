import { google } from "googleapis"
import * as fs from "fs"
import * as path from "path"

// CAR-206: Single source of truth — read token from the same file the CLI writes.
// Mirrors CAR-198's Gmail unification. CALENDAR_TOKEN_FILE env override allows
// explicit path configuration (e.g. in tests). Default: one level up from the
// dashboard dir (repo root) -> data/calendar_token.json.
function resolveTokenPath(): string {
  if (process.env.CALENDAR_TOKEN_FILE) {
    return process.env.CALENDAR_TOKEN_FILE
  }
  return path.resolve(process.cwd(), "..", "data", "calendar_token.json")
}

interface CalendarTokenFile {
  token?: string
  refresh_token?: string
  token_uri?: string
  client_id?: string
  client_secret?: string
  scopes?: string[]
  expiry?: string
}

export function getCalendarClient() {
  const tokenPath = resolveTokenPath()

  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Calendar token file not found at ${tokenPath}. Run 'python -m cli calendar' on the CLI to authenticate (or follow docs/solutions/best-practices/oauth-reauth.md).`
    )
  }

  const raw = fs.readFileSync(tokenPath, "utf-8")
  const tokenData: CalendarTokenFile = JSON.parse(raw)

  const refreshToken = tokenData.refresh_token
  if (!refreshToken) {
    throw new Error(
      `Token file at ${tokenPath} is missing the refresh_token field. Re-run CLI calendar auth.`
    )
  }

  // Client credentials come from the token file (written by CLI auth flow).
  // Fall back to env vars for parity with the legacy GOOGLE_CLIENT_ID/SECRET
  // configuration in case the token file is regenerated without them.
  const clientId = tokenData.client_id ?? process.env.GOOGLE_CLIENT_ID
  const clientSecret = tokenData.client_secret ?? process.env.GOOGLE_CLIENT_SECRET

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  return google.calendar({ version: "v3", auth: oauth2Client })
}
