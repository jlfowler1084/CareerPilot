import { NextResponse } from "next/server"

/**
 * Standard API error response shape.
 * All error responses from API routes should use these helpers
 * to ensure consistent status codes and response bodies.
 */
interface ApiError {
  error: string
  code?: string
  details?: unknown // NEVER pass raw errors, stack traces, or DB errors here
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json<ApiError>(
    { error: message, code: "BAD_REQUEST", details },
    { status: 400 }
  )
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json<ApiError>(
    { error: message, code: "UNAUTHORIZED" },
    { status: 401 }
  )
}

export function notFound(message = "Not found") {
  return NextResponse.json<ApiError>(
    { error: message, code: "NOT_FOUND" },
    { status: 404 }
  )
}

export function serverError(message = "Internal server error", details?: unknown) {
  return NextResponse.json<ApiError>(
    { error: message, code: "INTERNAL_ERROR", details },
    { status: 500 }
  )
}

export function badGateway(message = "Upstream service error", details?: unknown) {
  return NextResponse.json<ApiError>(
    { error: message, code: "BAD_GATEWAY", details },
    { status: 502 }
  )
}
