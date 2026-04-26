import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Slugify rules — must match dashboard/src/lib/prep-pack/naming.ts:slugify (CAR-182).
// Inlined here because CAR-182 has not merged yet; refactor to import once it does.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[/\\\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export interface ResearchMatch {
  name: string
  date: string
}

// Pure helper: given a slug and a list of filenames, return the latest matching
// research file (or null). Latest is determined by the YYYY-MM-DD date suffix.
export function findLatestResearchFile(slug: string, entries: string[]): ResearchMatch | null {
  if (!slug) return null
  const matchPattern = new RegExp(`^${slug}-(\\d{4}-\\d{2}-\\d{2})\\.md$`)
  const matches = entries
    .map((name) => ({ name, match: name.match(matchPattern) }))
    .filter((entry): entry is { name: string; match: RegExpMatchArray } => entry.match !== null)
    .sort((a, b) => (a.match[1] < b.match[1] ? 1 : -1))

  if (matches.length === 0) return null
  return { name: matches[0].name, date: matches[0].match[1] }
}

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

    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, company')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    const slug = slugify(application.company)
    if (!slug) {
      return NextResponse.json(
        {
          found: false,
          slug: '',
          hint: 'Company name could not be slugified — check the application has a valid company.',
        },
        { status: 404 }
      )
    }

    const researchDir = path.resolve(process.cwd(), '..', 'docs', 'research')

    let entries: string[] = []
    try {
      entries = await fs.readdir(researchDir)
    } catch (err) {
      // Directory missing or unreadable — treat as no research available.
      return NextResponse.json(
        {
          found: false,
          slug,
          hint: `No research yet. Run /careerpilot-research "${application.company}" in Claude Code.`,
        },
        { status: 404 }
      )
    }

    const latest = findLatestResearchFile(slug, entries)
    if (!latest) {
      return NextResponse.json(
        {
          found: false,
          slug,
          hint: `No research yet. Run /careerpilot-research "${application.company}" in Claude Code.`,
        },
        { status: 404 }
      )
    }

    const filePath = path.join(researchDir, latest.name)
    const markdown = await fs.readFile(filePath, 'utf-8')

    return NextResponse.json({
      found: true,
      slug,
      filename: latest.name,
      date: latest.date,
      markdown,
    })
  } catch (error) {
    console.error('Research fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
