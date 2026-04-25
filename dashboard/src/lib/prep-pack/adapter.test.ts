// dashboard/src/lib/prep-pack/adapter.test.ts
import { describe, it, expect } from 'vitest';
import { toIntelligenceSnapshot } from './adapter';
import type { Application } from '@/types';
import type { CompanyBriefRow, InterviewPrepRow } from '@/lib/intelligence/supabase-helpers';

const application = {
  id: 'abc-123',
  title: 'IT Network and Sys Admin',
  company: 'Irving Materials',
} as Application;

const brief: CompanyBriefRow = {
  id: 'brief-1',
  application_id: 'abc-123',
  user_id: 'user-1',
  company_name: 'Irving Materials',
  brief_data: {
    overview: 'Indiana-based aggregates supplier.',
    culture: 'Building long-lasting relationships and safety.',
    glassdoor_summary: '3.4/5 (54 reviews)',
    headcount: '2,200',
    funding_stage: 'Privately held',
    tech_stack: ['SolarWinds', 'VMware', 'Nimble SAN'],
    why_good_fit: 'Joe\'s 20+ years align with their needs',
    red_flags: 'Some Glassdoor reviews mention nepotism',
    recent_news: ['Engineering Aggregates acquisition Feb 2025'],
    questions_to_research: ['ERP timeline?'],
  },
  generated_at: '2026-04-20T00:00:00Z',
  model_used: 'claude-haiku-4-5',
  generation_cost_cents: 6,
  created_at: '2026-04-20T00:00:00Z',
};

const prepPhone: InterviewPrepRow = {
  id: 'prep-1',
  application_id: 'abc-123',
  user_id: 'user-1',
  stage: 'phone_screen',
  prep_data: {
    career_narrative_angle: 'Phone-screen narrative',
    likely_questions: [
      { question: 'Tell me about yourself', category: 'behavioral', suggested_approach: 'Lead with progression' },
    ],
    talking_points: ['Phone TP1', 'Phone TP2'],
    gaps_to_address: [{ gap: 'Phone gap', mitigation: 'Phone mitig' }],
    questions_to_ask: [{ question: 'Phone Q?', why: 'Phone why' }],
    stage_specific_tips: ['Phone tip'],
  },
  generated_at: '2026-04-20T00:00:00Z',
  model_used: 'claude-haiku-4-5',
  generation_cost_cents: 8,
  created_at: '2026-04-20T00:00:00Z',
};

const prepTechnical: InterviewPrepRow = {
  ...prepPhone,
  id: 'prep-2',
  stage: 'technical',
  prep_data: {
    career_narrative_angle: 'Technical narrative — most recent',
    likely_questions: [
      { question: 'Walk me through standardizing 175 servers', category: 'technical', suggested_approach: 'Reference Venable...' },
    ],
    talking_points: ['Tech TP1', 'Tech TP2'],
    gaps_to_address: [{ gap: 'Tech gap', mitigation: 'Tech mitig' }],
    questions_to_ask: [{ question: 'Tech Q?', why: 'Tech why' }],
    stage_specific_tips: ['Tech tip 1', 'Tech tip 2'],
  },
  generated_at: '2026-04-21T00:00:00Z', // newer
};

describe('toIntelligenceSnapshot', () => {
  it('extracts company/jobTitle/applicationId from application', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [] });
    expect(snap.company).toBe('Irving Materials');
    expect(snap.jobTitle).toBe('IT Network and Sys Admin');
    expect(snap.applicationId).toBe('abc-123');
  });

  it('returns undefined companyResearch and interviewPrep when both data sources are empty', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [] });
    expect(snap.companyResearch).toBeUndefined();
    expect(snap.interviewPrep).toBeUndefined();
  });

  it('maps all brief_data fields into companyResearch with camelCase keys', () => {
    const snap = toIntelligenceSnapshot(application, { brief, preps: [] });
    expect(snap.companyResearch?.overview).toBe('Indiana-based aggregates supplier.');
    expect(snap.companyResearch?.culture).toBe('Building long-lasting relationships and safety.');
    expect(snap.companyResearch?.glassdoor).toBe('3.4/5 (54 reviews)');
    expect(snap.companyResearch?.headcount).toBe('2,200');
    expect(snap.companyResearch?.fundingStage).toBe('Privately held');
    expect(snap.companyResearch?.techStack).toEqual(['SolarWinds', 'VMware', 'Nimble SAN']);
    expect(snap.companyResearch?.whyGoodFit).toBe('Joe\'s 20+ years align with their needs');
    expect(snap.companyResearch?.redFlags).toBe('Some Glassdoor reviews mention nepotism');
    expect(snap.companyResearch?.recentNews).toEqual(['Engineering Aggregates acquisition Feb 2025']);
    expect(snap.companyResearch?.questionsToResearch).toEqual(['ERP timeline?']);
  });

  it('uses the most recent prep (max generated_at) when multiple stages exist', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [prepPhone, prepTechnical] });
    expect(snap.interviewPrep?.careerNarrativeAngle).toBe('Technical narrative — most recent');
    expect(snap.interviewPrep?.likelyQuestions?.[0].question).toBe('Walk me through standardizing 175 servers');
    expect(snap.interviewPrep?.talkingPoints).toEqual(['Tech TP1', 'Tech TP2']);
  });

  it('maps likely_questions snake_case to camelCase suggestedApproach', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [prepTechnical] });
    expect(snap.interviewPrep?.likelyQuestions?.[0].suggestedApproach).toBe('Reference Venable...');
    expect(snap.interviewPrep?.likelyQuestions?.[0].category).toBe('technical');
  });

  it('maps stage_specific_tips to stageTips', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [prepTechnical] });
    expect(snap.interviewPrep?.stageTips).toEqual(['Tech tip 1', 'Tech tip 2']);
  });

  it('passes through gaps_to_address and questions_to_ask shapes unchanged', () => {
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [prepTechnical] });
    expect(snap.interviewPrep?.gapsToAddress).toEqual([{ gap: 'Tech gap', mitigation: 'Tech mitig' }]);
    expect(snap.interviewPrep?.questionsToAsk).toEqual([{ question: 'Tech Q?', why: 'Tech why' }]);
  });

  it('tolerates missing keys inside brief_data without throwing', () => {
    const sparseBrief: CompanyBriefRow = {
      ...brief,
      brief_data: { culture: 'Just culture', tech_stack: [] },
    };
    const snap = toIntelligenceSnapshot(application, { brief: sparseBrief, preps: [] });
    expect(snap.companyResearch?.culture).toBe('Just culture');
    expect(snap.companyResearch?.glassdoor).toBeUndefined();
    expect(snap.companyResearch?.fundingStage).toBeUndefined();
    expect(snap.companyResearch?.techStack).toEqual([]);
  });

  it('tolerates missing keys inside prep_data without throwing', () => {
    const sparsePrep: InterviewPrepRow = {
      ...prepTechnical,
      prep_data: { career_narrative_angle: 'Just narrative' },
    };
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [sparsePrep] });
    expect(snap.interviewPrep?.careerNarrativeAngle).toBe('Just narrative');
    expect(snap.interviewPrep?.likelyQuestions).toBeUndefined();
    expect(snap.interviewPrep?.talkingPoints).toBeUndefined();
  });

  it('drops malformed likely_question items missing required fields', () => {
    const malformedPrep: InterviewPrepRow = {
      ...prepTechnical,
      prep_data: {
        likely_questions: [
          { question: 'Valid Q', category: 'technical', suggested_approach: 'Valid A' },
          { question: 'Missing approach' }, // dropped
          { suggested_approach: 'Missing question' }, // dropped
          'not even an object', // dropped
        ],
      },
    };
    const snap = toIntelligenceSnapshot(application, { brief: null, preps: [malformedPrep] });
    expect(snap.interviewPrep?.likelyQuestions).toHaveLength(1);
    expect(snap.interviewPrep?.likelyQuestions?.[0].question).toBe('Valid Q');
  });
});
