export function extractSecondLevelDomain(domain: string | null): string | null {
  if (!domain) return null
  const parts = domain.split(".")
  // For "mail.cummins.com" → ["mail", "cummins", "com"] → "cummins"
  // For "cummins.com" → ["cummins", "com"] → "cummins"
  return parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : null
}

interface AppForMatch {
  id: string
  company: string
  status: string
}

export function findDomainMatch(
  fromDomain: string,
  applications: AppForMatch[]
): string | null {
  const sld = extractSecondLevelDomain(fromDomain)
  if (!sld) return null

  const matches = applications.filter((app) =>
    app.company.toLowerCase().includes(sld)
  )

  // Only suggest if exactly one match (no ambiguity)
  return matches.length === 1 ? matches[0].id : null
}
