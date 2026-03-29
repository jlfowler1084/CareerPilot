import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getIntelligenceSummary,
  getSkillMentions,
} from '@/lib/intelligence/supabase-helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { applicationId } = await params

    if (!applicationId) {
      return NextResponse.json(
        { error: 'applicationId is required' },
        { status: 400 }
      )
    }

    // Verify the application belongs to this user
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .single()

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    // Fetch intelligence summary + skill mentions in parallel
    const [summary, skillsResult] = await Promise.all([
      getIntelligenceSummary(supabase, applicationId),
      getSkillMentions(supabase, user.id),
    ])

    return NextResponse.json({
      brief: summary.brief,
      preps: summary.preps,
      debriefs: summary.debriefs,
      skill_mentions: skillsResult.data,
    })
  } catch (error) {
    console.error('Intelligence fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
