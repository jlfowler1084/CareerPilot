import { describe, it, expect } from 'vitest'
import {
  slugify,
  findLatestResearchFile,
} from '@/app/api/research/[applicationId]/route'

describe('slugify (research route)', () => {
  // These cases must match dashboard/src/lib/prep-pack/naming.ts:slugify exactly.
  // If CAR-182 changes that function, this test set should be updated together.
  it('produces underscore form, not kebab', () => {
    expect(slugify('Irving Materials')).toBe('irving_materials')
  })

  it('strips periods and commas, preserves word boundaries', () => {
    expect(slugify('J.D. Irving, Limited')).toBe('jd_irving_limited')
  })

  it('treats slashes and hyphens as separators', () => {
    expect(slugify('Acme/Foo Corp.')).toBe('acme_foo_corp')
    expect(slugify('Foo-Bar Co')).toBe('foo_bar_co')
  })

  it('strips non-alphanumeric characters like &', () => {
    expect(slugify('M&M Industries')).toBe('mm_industries')
  })

  it('collapses runs of separators and trims edges', () => {
    expect(slugify('  ___Foo   Bar___ ')).toBe('foo_bar')
  })

  it('returns empty string for input that slugifies to nothing', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('   ')).toBe('')
  })
})

describe('findLatestResearchFile', () => {
  it('returns the matching file when there is exactly one', () => {
    const result = findLatestResearchFile('irving_materials', [
      'irving_materials-2026-04-26.md',
      'other_company-2026-04-25.md',
    ])
    expect(result).toEqual({
      name: 'irving_materials-2026-04-26.md',
      date: '2026-04-26',
    })
  })

  it('returns the most recent file when multiple match the same slug', () => {
    const result = findLatestResearchFile('irving_materials', [
      'irving_materials-2026-04-20.md',
      'irving_materials-2026-04-26.md',
      'irving_materials-2026-04-22.md',
    ])
    expect(result?.name).toBe('irving_materials-2026-04-26.md')
    expect(result?.date).toBe('2026-04-26')
  })

  it('returns null when no file matches the slug', () => {
    const result = findLatestResearchFile('irving_materials', [
      'other_company-2026-04-26.md',
      'README.md',
    ])
    expect(result).toBeNull()
  })

  it('returns null on an empty entry list', () => {
    expect(findLatestResearchFile('irving_materials', [])).toBeNull()
  })

  it('returns null when the slug is empty', () => {
    expect(findLatestResearchFile('', ['anything-2026-04-26.md'])).toBeNull()
  })

  it('does not match files with a different separator or non-date suffix', () => {
    const result = findLatestResearchFile('irving_materials', [
      'irving_materials_2026-04-26.md', // underscore instead of hyphen before date
      'irving_materials-26-04-2026.md', // wrong date order
      'irving_materials-2026-04-26.txt', // wrong extension
      'irving_materials.md', // no date
    ])
    expect(result).toBeNull()
  })

  it('does not match a slug that is a prefix of a file slug', () => {
    // "irving" should not match "irving_materials-..."
    const result = findLatestResearchFile('irving', [
      'irving_materials-2026-04-26.md',
    ])
    expect(result).toBeNull()
  })
})
