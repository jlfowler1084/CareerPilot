import { Database } from "./database.types"

// Row types for direct use in components and hooks
export type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"]
export type EmailRow = Database["public"]["Tables"]["emails"]["Row"]
export type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"]
export type ApplicationEventRow = Database["public"]["Tables"]["application_events"]["Row"]
export type AutoApplyQueueItemRow = Database["public"]["Tables"]["auto_apply_queue"]["Row"]
export type EmailApplicationLinkRow = Database["public"]["Tables"]["email_application_links"]["Row"]
export type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"]
export type SearchRunRow = Database["public"]["Tables"]["search_runs"]["Row"]
export type ScanResultRow = Database["public"]["Tables"]["scan_results"]["Row"]
export type ScanMetadataRow = Database["public"]["Tables"]["scan_metadata"]["Row"]
export type SkillInventoryItemRow = Database["public"]["Tables"]["skills_inventory"]["Row"]
export type SearchCacheEntryRow = Database["public"]["Tables"]["search_cache"]["Row"]
export type JobSearchResultRow = Database["public"]["Tables"]["job_search_results"]["Row"]

// Insert types for create operations
export type ApplicationInsert = Database["public"]["Tables"]["applications"]["Insert"]
export type EmailInsert = Database["public"]["Tables"]["emails"]["Insert"]
export type ConversationInsert = Database["public"]["Tables"]["conversations"]["Insert"]
export type ApplicationEventInsert = Database["public"]["Tables"]["application_events"]["Insert"]
export type AutoApplyQueueItemInsert = Database["public"]["Tables"]["auto_apply_queue"]["Insert"]
export type EmailApplicationLinkInsert = Database["public"]["Tables"]["email_application_links"]["Insert"]

// Update types for partial updates
export type ApplicationUpdate = Database["public"]["Tables"]["applications"]["Update"]
export type EmailUpdate = Database["public"]["Tables"]["emails"]["Update"]
export type ConversationUpdate = Database["public"]["Tables"]["conversations"]["Update"]
export type AutoApplyQueueItemUpdate = Database["public"]["Tables"]["auto_apply_queue"]["Update"]
export type JobSearchResultUpdate = Database["public"]["Tables"]["job_search_results"]["Update"]
