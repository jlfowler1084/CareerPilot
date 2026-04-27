// Direct MCP client for Dice job search.
// Calls mcp.dice.com/mcp using Streamable HTTP transport.
// No Claude API intermediary — no token cost.
//
// The Dice MCP server may or may not return a Mcp-Session-Id header. The SDK
// (1.28.0+) handles this gracefully: session ID is set only when present and
// is never required for the request to succeed.

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const DICE_MCP_URL = "https://mcp.dice.com/mcp"

export interface DiceSearchParams {
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
 *
 * Throws on MCP-level errors (including rate-limit responses). The caller
 * is responsible for mapping thrown errors to HTTP status codes.
 */
export async function searchDiceDirect(params: DiceSearchParams): Promise<string> {
  const client = new Client(
    { name: "careerpilot-dashboard", version: "1.0.0" },
    { capabilities: {} }
  )

  const transport = new StreamableHTTPClientTransport(new URL(DICE_MCP_URL))

  try {
    await client.connect(transport)

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

    const result = await client.callTool({ name: "search_jobs", arguments: args })

    const content = result.content as { type: string; text?: string }[] | undefined

    if (result.isError) {
      const errMsg =
        content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text || "")
          .join(" ") || "unknown"
      throw new Error(`Dice MCP error: ${errMsg}`)
    }

    return (
      content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("\n") ?? ""
    )
  } finally {
    await client.close()
  }
}
