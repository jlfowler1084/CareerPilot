// dashboard/src/lib/prep-pack/assemble-source.test.ts
import { describe, it, expect } from 'vitest';
import { assembleSource } from './assemble-source';
import type { IntelligenceSnapshot } from './types';

const fullIntel: IntelligenceSnapshot = {
  company: 'Irving Materials',
  jobTitle: 'IT Network and Sys Admin',
  applicationId: 'abc-123',
  companyResearch: {
    culture: 'Building long-lasting relationships and safety.',
    glassdoor: '3.4/5 (54 reviews)',
    headcount: '2,200',
    fundingStage: 'Privately held; $500M-$1B revenue',
    techStack: ['SolarWinds', 'VMware', 'Nimble SAN', 'Active Directory'],
    whyGoodFit: 'Joe\'s 20+ years of enterprise IT experience aligns with...',
    redFlags: 'Some Glassdoor reviews mention nepotism concerns.',
    recentNews: ['Engineering Aggregates acquisition Feb 2025', 'Hiring expansion'],
    questionsToResearch: ['ERP timeline?', 'Google Workspace adoption status?'],
  },
  interviewPrep: {
    careerNarrativeAngle: 'My 20-year progression represents deliberate evolution...',
    likelyQuestions: [
      { question: 'Walk me through standardizing 175 servers.', answer: 'Reference Venable VMware experience...' },
      { question: 'Automate VM provisioning with PowerShell.', answer: 'Draw on PowerCLI experience...' },
    ],
    gapsToAddress: 'Limited Splunk dashboard experience compared to their needs.',
    talkingPoints: 'Lead with PowerShell automation portfolio.',
    questionsToAsk: 'What does success look like in the first 90 days?',
    stageTips: 'Bring printed PowerShell module example.',
  },
};

describe('assembleSource', () => {
  it('places Custom Focus first as ### Instructions block when non-empty', () => {
    const result = assembleSource(fullIntel, 'Lean heavy on SCCM');
    const lines = result.split('\n');
    expect(lines[0]).toBe('### Instructions');
    expect(lines[1]).toBe('Lean heavy on SCCM');
    // The first H1 should follow the instruction block
    expect(result).toMatch(/^### Instructions[\s\S]+?\n# Irving Materials/);
  });

  it('omits the ### Instructions block entirely when customFocus is empty', () => {
    const result = assembleSource(fullIntel, '');
    expect(result).not.toContain('### Instructions');
    expect(result.startsWith('# Irving Materials')).toBe(true);
  });

  it('emits sections in canonical order', () => {
    const result = assembleSource(fullIntel, '');
    const sections = [
      '## Career Narrative Angle',
      '## Why This Role Fits',
      '## Company Snapshot',
      '## Tech Stack',
      '## Recent News',
      '## Red Flags to Be Aware Of',
      '## Likely Interview Questions',
      '## Gaps to Address',
      '## Talking Points',
      '## Questions to Ask Them',
      '## Questions to Research Before the Interview',
      '## Stage Tips',
    ];
    let lastIdx = -1;
    for (const heading of sections) {
      const idx = result.indexOf(heading);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('renders likely-question entries as ### subheadings with answers', () => {
    const result = assembleSource(fullIntel, '');
    expect(result).toContain('### Walk me through standardizing 175 servers.');
    expect(result).toContain('Reference Venable VMware experience...');
    expect(result).toContain('### Automate VM provisioning with PowerShell.');
  });

  it('omits Red Flags section entirely when empty', () => {
    const intel: IntelligenceSnapshot = {
      ...fullIntel,
      companyResearch: { ...fullIntel.companyResearch, redFlags: '' },
    };
    const result = assembleSource(intel, '');
    expect(result).not.toContain('## Red Flags');
  });

  it('omits Likely Interview Questions when array is empty', () => {
    const intel: IntelligenceSnapshot = {
      ...fullIntel,
      interviewPrep: { ...fullIntel.interviewPrep, likelyQuestions: [] },
    };
    const result = assembleSource(intel, '');
    expect(result).not.toContain('## Likely Interview Questions');
  });

  it('omits Tech Stack when techStack array is empty or undefined', () => {
    const intel: IntelligenceSnapshot = {
      ...fullIntel,
      companyResearch: { ...fullIntel.companyResearch, techStack: [] },
    };
    expect(assembleSource(intel, '')).not.toContain('## Tech Stack');
  });

  it('renders Tech Stack as bullet list', () => {
    const result = assembleSource(fullIntel, '');
    expect(result).toContain('- SolarWinds');
    expect(result).toContain('- VMware');
    expect(result).toContain('- Nimble SAN');
  });

  it('renders Company Snapshot as labeled bullets, omitting any empty subfield', () => {
    const intel: IntelligenceSnapshot = {
      ...fullIntel,
      companyResearch: {
        ...fullIntel.companyResearch,
        glassdoor: '',
        fundingStage: undefined,
      },
    };
    const result = assembleSource(intel, '');
    expect(result).toContain('- Culture: Building long-lasting relationships');
    expect(result).toContain('- Headcount: 2,200');
    expect(result).not.toContain('- Glassdoor:');
    expect(result).not.toContain('- Funding / Stage:');
  });

  it('produces a top-line H1 with company and job title', () => {
    const result = assembleSource(fullIntel, '');
    expect(result).toContain('# Irving Materials — IT Network and Sys Admin — Interview Prep');
  });
});
