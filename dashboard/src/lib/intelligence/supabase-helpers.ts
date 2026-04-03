import { SupabaseClient } from '@supabase/supabase-js'

// ── Row types matching Supabase schema ──────────────────────────────

export interface CompanyBriefRow {
  id: string
  application_id: string
  user_id: string
  company_name: string
  brief_data: Record<string, unknown>
  generated_at: string
  model_used: string
  generation_cost_cents: number
  created_at: string
}

export interface InterviewPrepRow {
  id: string
  application_id: string
  user_id: string
  stage: string
  prep_data: Record<string, unknown>
  generated_at: string
  model_used: string
  generation_cost_cents: number
  created_at: string
}

export interface DebriefRow {
  id: string
  application_id: string
  user_id: string
  stage: string
  went_well: string | null
  was_hard: string | null
  do_differently: string | null
  key_takeaways: string[]
  interviewer_names: string[]
  topics_covered: string[]
  ai_analysis: Record<string, unknown> | null
  model_used: string | null
  generation_cost_cents: number
  created_at: string
}

export interface SkillMentionRow {
  id: string
  user_id: string
  skill_name: string
  mention_count: number
  application_ids: string[]
  in_resume: boolean
  last_updated: string
}

// ── Company Briefs ──────────────────────────────────────────────────

export async function getCompanyBrief(
  supabase: SupabaseClient,
  applicationId: string
) {
  const { data, error } = await supabase
    .from('company_briefs')
    .select('*')
    .eq('application_id', applicationId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return { data: data as CompanyBriefRow | null, error }
}

export async function upsertCompanyBrief(
  supabase: SupabaseClient,
  brief: Omit<CompanyBriefRow, 'id' | 'created_at'>
) {
  const { data, error } = await supabase
    .from('company_briefs')
    .upsert(brief, { onConflict: 'application_id' })
    .select()
    .single()

  return { data: data as CompanyBriefRow | null, error }
}

// ── Interview Prep (new table) ──────────────────────────────────────

export async function getInterviewPrep(
  supabase: SupabaseClient,
  applicationId: string,
  stage?: string
) {
  let query = supabase
    .from('interview_prep')
    .select('*')
    .eq('application_id', applicationId)

  if (stage) {
    query = query.eq('stage', stage)
  }

  const { data, error } = await query.order('generated_at', {
    ascending: false,
  })

  return { data: (data ?? []) as InterviewPrepRow[], error }
}

export async function upsertInterviewPrep(
  supabase: SupabaseClient,
  prep: Omit<InterviewPrepRow, 'id' | 'created_at'>
) {
  const { data, error } = await supabase
    .from('interview_prep')
    .upsert(prep)
    .select()
    .single()

  return { data: data as InterviewPrepRow | null, error }
}

// ── Debriefs ────────────────────────────────────────────────────────

export async function getDebriefs(
  supabase: SupabaseClient,
  applicationId: string
) {
  const { data, error } = await supabase
    .from('debriefs')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })

  return { data: (data ?? []) as DebriefRow[], error }
}

export async function createDebrief(
  supabase: SupabaseClient,
  debrief: Omit<DebriefRow, 'id' | 'created_at'>
) {
  const { data, error } = await supabase
    .from('debriefs')
    .insert(debrief)
    .select()
    .single()

  return { data: data as DebriefRow | null, error }
}

export async function updateDebrief(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<
    Omit<DebriefRow, 'id' | 'application_id' | 'user_id' | 'created_at'>
  >
) {
  const { data, error } = await supabase
    .from('debriefs')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle()

  return { data: data as DebriefRow | null, error }
}

// ── Skill Mentions ──────────────────────────────────────────────────

export async function getSkillMentions(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('skill_mentions')
    .select('*')
    .eq('user_id', userId)
    .order('mention_count', { ascending: false })

  return { data: (data ?? []) as SkillMentionRow[], error }
}

export async function upsertSkillMention(
  supabase: SupabaseClient,
  mention: Omit<SkillMentionRow, 'id' | 'last_updated'>
) {
  const { data, error } = await supabase
    .from('skill_mentions')
    .upsert(mention, { onConflict: 'user_id,skill_name' })
    .select()
    .single()

  return { data: data as SkillMentionRow | null, error }
}

// ── Aggregate: Intelligence Summary ─────────────────────────────────

export interface IntelligenceSummary {
  brief: CompanyBriefRow | null
  preps: InterviewPrepRow[]
  debriefs: DebriefRow[]
}

export async function getIntelligenceSummary(
  supabase: SupabaseClient,
  applicationId: string
): Promise<IntelligenceSummary> {
  const [briefResult, prepsResult, debriefsResult] = await Promise.all([
    getCompanyBrief(supabase, applicationId),
    getInterviewPrep(supabase, applicationId),
    getDebriefs(supabase, applicationId),
  ])

  return {
    brief: briefResult.data,
    preps: prepsResult.data,
    debriefs: debriefsResult.data,
  }
}
