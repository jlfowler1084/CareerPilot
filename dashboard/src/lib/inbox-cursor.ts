// CAR-197: rule for whether `user_settings.last_email_scan` should advance
// after a scan run. Extracted to its own module so it has no React or Supabase
// imports and can be unit-tested in isolation.
//
// Rule: only advance the cursor when the scan actually ingested at least one
// new email. The pre-CAR-197 logic advanced unconditionally on any successful
// page, which let an empty or silently-failing scan ratchet the cursor forward
// and disguise genuine staleness behind a fresh-looking timestamp.

export interface CursorAdvanceArgs {
  scanSucceeded: boolean
  newInsertedCount: number
}

export function shouldAdvanceCursor(args: CursorAdvanceArgs): boolean {
  return args.scanSucceeded && args.newInsertedCount > 0
}
