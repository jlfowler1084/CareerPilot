// Direct MCP client for Dice job search.
// Calls mcp.dice.com/mcp using Streamable HTTP transport.
// No Claude API intermediary — no token cost.

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const DICE_MCP_URL = "https://mcp.dice.com/mcp"

interface DiceSearchParams {
  keyword: string
  location: string
  radiusMiles?: number
  jobsPerPage?: number
  contractOnly?: boolean
  postedDate?: string
}

/**
 * Call Dice MCP directly via Streamable HTTP transport.
 * Returns the raw text content from the MCP tool result,
 * which is JSON matching the format parseDiceResults() expects.
 */
export async function searchDiceDirect(
  params: DiceSearchParams
): Promise<string> {
  const client = new Client(
    { name: "careerpilot-dashboard", version: "1.0.0" },
    { capabilities: {} }
  )

  const transport = new StreamableHTTPClientTransport(
    new URL(DICE_MCP_URL)
  )

  try {
    await client.connect(transport)

    // Build arguments matching the Dice MCP search_jobs schema
    const args: Record<string, unknown> = {
      keyword: params.keyword,
      location: params.location,
    }
    if (params.radiusMiles) {
      args.radius = params.radiusMiles
      args.radius_unit = "mi"
    }
    if (params.jobsPerPage) {
      args.jobs_per_page = params.jobsPerPage
    }
    if (params.postedDate) {
      args.posted_date = params.postedDate
    }
    if (params.contractOnly) {
      args.employment_types = ["CONTRACTS"]
    }

    const result = await client.callTool({
      name: "search_jobs",
      arguments: args,
    })

    // The SDK result has an index signature that widens content to unknown,
    // so we cast it to the known shape.
    const content = result.content as
      | { type: string; text?: string }[]
      | undefined

    if (result.isError) {
      const errMsg = content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join(" ") || "unknown"
      throw new Error(`Dice MCP error: ${errMsg}`)
    }

    // Return the text content — it's JSON that parseDiceResults() can handle
    const text = content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n") || ""

    return text
  } finally {
    await client.close()
  }
}
