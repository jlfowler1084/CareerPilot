import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getModelConfig, type IntelligenceType } from '@/lib/intelligence/model-config'
import { generateCompanyBrief } from '@/lib/intelligence/generators/company-brief'
import { generateInterviewPrep } from '@/lib/intelligence/generators/interview-prep'
import { upsertCompanyBrief, upsertInterviewPrep, getCompanyBrief, getDebriefs } from '@/lib/intelligence/supabase-helpers'

const VALID_TYPES: IntelligenceType[] = [
  'company_brief',
  'interview_prep',
  'debrief_analysis',
  'skill_extraction',
]

const VALID_STAGES = [
  'phone_screen',
  'technical',
  'hiring_manager',
  'final_round',
  'offer',
]

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, application_id, stage } = body as {
      type?: string
      application_id?: string
      stage?: string
    }

    // Validate required fields
    if (!type || !VALID_TYPES.includes(type as IntelligenceType)) {
      return NextResponse.json(
        {
          error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    if (!application_id) {
      return NextResponse.json(
        { error: 'application_id is required' },
        { status: 400 }
      )
    }

    if (type === 'interview_prep') {
      if (!stage || !VALID_STAGES.includes(stage)) {
        return NextResponse.json(
          {
            error: `stage is required for interview_prep. Must be one of: ${VALID_STAGES.join(', ')}`,
          },
          { status: 400 }
        )
      }
    }

    // Verify the application exists and belongs to this user
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, title, company, job_description, status')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    // Get model config for this intelligence type
    const config = getModelConfig(type as IntelligenceType)

    // ── Company Brief: real generation via Claude + web search ──
    if (type === 'company_brief') {
      try {
        const result = await generateCompanyBrief(
          application.company,
          application.title,
          application.job_description
        )

        // Store in Supabase
        const { error: upsertError } = await upsertCompanyBrief(supabase, {
          application_id,
          user_id: user.id,
          company_name: application.company,
          brief_data: result.briefData as unknown as Record<string, unknown>,
          generated_at: new Date().toISOString(),
          model_used: result.modelUsed,
          generation_cost_cents: result.costCents,
        })

        if (upsertError) {
          console.error('Failed to store company brief:', upsertError)
        }

        // Log the event
        await supabase.from('application_events').insert({
          application_id,
          user_id: user.id,
          event_type: 'intelligence_generated',
          description: `Company brief generated for ${application.company}`,
          new_value: JSON.stringify({
            type,
            model: result.modelUsed,
            cost_cents: result.costCents,
          }),
        })

        return NextResponse.json({
          success: true,
          type: 'company_brief',
          data: result.briefData,
          model: result.modelUsed,
          cost_cents: result.costCents,
        })
      } catch (genError) {
        console.error('Company brief generation failed:', genError)
        return NextResponse.json(
          {
            success: false,
            error: 'Brief generation failed',
            details:
              genError instanceof Error
                ? genError.message
                : 'Unknown generation error',
          },
          { status: 500 }
        )
      }
    }

    // ── Interview Prep: real generation via Claude ──
    if (type === 'interview_prep') {
      try {
        // Fetch company brief for additional context (if exists)
        const { data: briefRow } = await getCompanyBrief(supabase, application_id)
        const companyBriefData = briefRow?.brief_data ?? null

        // Fetch prior debriefs for this application (if any)
        const { data: debriefRows } = await getDebriefs(supabase, application_id)
        const priorDebriefs =
          debriefRows && debriefRows.length > 0
            ? debriefRows.map((d) => ({
                stage: d.stage,
                went_well: d.went_well,
                was_hard: d.was_hard,
                do_differently: d.do_differently,
                key_takeaways: d.key_takeaways,
              }))
            : null

        const result = await generateInterviewPrep(
          application.company,
          application.title,
          application.job_description,
          stage!,
          companyBriefData as Record<string, unknown> | null,
          priorDebriefs
        )

        // Store in Supabase
        const { error: upsertError } = await upsertInterviewPrep(supabase, {
          application_id,
          user_id: user.id,
          stage: stage!,
          prep_data: result.prepData as unknown as Record<string, unknown>,
          generated_at: new Date().toISOString(),
          model_used: result.modelUsed,
          generation_cost_cents: result.costCents,
        })

        if (upsertError) {
          console.error('Failed to store interview prep:', upsertError)
        }

        // Log the event
        await supabase.from('application_events').insert({
          application_id,
          user_id: user.id,
          event_type: 'intelligence_generated',
          description: `Interview prep generated for ${application.company} (${stage})`,
          new_value: JSON.stringify({
            type,
            stage,
            model: result.modelUsed,
            cost_cents: result.costCents,
          }),
        })

        return NextResponse.json({
          success: true,
          type: 'interview_prep',
          stage,
          data: result.prepData,
          model: result.modelUsed,
          cost_cents: result.costCents,
        })
      } catch (genError) {
        console.error('Interview prep generation failed:', genError)
        return NextResponse.json(
          {
            success: false,
            error: 'Interview prep generation failed',
            details:
              genError instanceof Error
                ? genError.message
                : 'Unknown generation error',
          },
          { status: 500 }
        )
      }
    }

    // ── Other types: placeholder (future stories) ──
    // Log the request to application_events
    await supabase.from('application_events').insert({
      application_id,
      user_id: user.id,
      event_type: 'intelligence_generated',
      description: `Intelligence generation requested: ${type}${stage ? ` (${stage})` : ''}`,
      new_value: JSON.stringify({
        type,
        model: config.model,
        stage: stage || null,
      }),
    })

    return NextResponse.json({
      success: true,
      type,
      model: config.model,
      message: `Generation not yet implemented for: ${type}`,
      application: {
        id: application.id,
        title: application.title,
        company: application.company,
      },
      ...(stage && { stage }),
    })
  } catch (error) {
    console.error('Intelligence generate error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
