import { google } from "googleapis"

export function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  // Use GMAIL_REFRESH_TOKEN if set, otherwise fall back to shared GOOGLE_REFRESH_TOKEN
  const refreshToken =
    process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN

  if (!refreshToken) {
    throw new Error("No Gmail refresh token configured. Set GMAIL_REFRESH_TOKEN or GOOGLE_REFRESH_TOKEN in env vars.")
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken })

  return google.gmail({ version: "v1", auth: oauth2Client })
}
