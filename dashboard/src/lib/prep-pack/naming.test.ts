// dashboard/src/lib/prep-pack/naming.test.ts
import { describe, it, expect } from 'vitest';
import { buildJobStem, slugify } from './naming';

describe('slugify', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugify('Irving Materials')).toBe('irving_materials');
  });

  it('strips non-alphanumeric characters except underscores', () => {
    expect(slugify("O'Brien & Co.")).toBe('obrien_co');
  });

  it('replaces slashes with underscores', () => {
    expect(slugify('IT Network/Sys Admin')).toBe('it_network_sys_admin');
  });

  it('collapses runs of underscores', () => {
    expect(slugify('Foo  -  Bar')).toBe('foo_bar');
  });

  it('trims leading/trailing underscores', () => {
    expect(slugify('  Foo  ')).toBe('foo');
  });

  it('returns empty string for entirely-stripped input', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('buildJobStem', () => {
  it('produces company_title_prep_<timestamp> stem', () => {
    const ts = new Date('2026-04-25T18:30:00');
    expect(buildJobStem('Irving Materials', 'IT Network and Sys Admin', ts))
      .toBe('irving_materials_it_network_and_sys_admin_prep_2026-04-25-1830');
  });

  it('zero-pads month, day, hour, minute', () => {
    const ts = new Date('2026-01-05T03:07:00');
    expect(buildJobStem('Acme', 'Engineer', ts))
      .toBe('acme_engineer_prep_2026-01-05-0307');
  });

  it('throws if either company or jobTitle slugifies to empty', () => {
    expect(() => buildJobStem('!!!', 'Engineer', new Date()))
      .toThrow(/company.*empty/i);
    expect(() => buildJobStem('Acme', '!!!', new Date()))
      .toThrow(/jobTitle.*empty/i);
  });
});
