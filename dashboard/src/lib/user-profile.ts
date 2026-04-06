import type { User } from "@supabase/supabase-js"

/**
 * Resolve the authenticated user's display name.
 * Priority: Supabase user_metadata.full_name → USER_FULL_NAME env var → "User"
 */
export function getUserName(user?: User | null): string {
  return user?.user_metadata?.full_name || process.env.USER_FULL_NAME || "User"
}

/**
 * Resolve the authenticated user's email address.
 * Priority: Supabase auth email → USER_EMAIL env var → ""
 */
export function getUserEmail(user?: User | null): string {
  return user?.email || process.env.USER_EMAIL || ""
}
