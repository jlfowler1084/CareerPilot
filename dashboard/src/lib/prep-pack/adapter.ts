// dashboard/src/lib/prep-pack/adapter.ts
import type { Application } from '@/types';
import type { CompanyBriefRow, InterviewPrepRow } from '@/lib/intelligence/supabase-helpers';
import type { IntelligenceSnapshot } from './types';

interface AdapterInput {
  brief: CompanyBriefRow | null;
  preps: InterviewPrepRow[];
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const v = obj[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter((item): item is string => typeof item === 'string');
}

type LikelyQuestion = {
  question: string;
  category?: 'behavioral' | 'technical' | 'situational' | 'culture_fit';
  suggestedApproach: string;
};

function getLikelyQuestions(obj: Record<string, unknown>): LikelyQuestion[] | undefined {
  const v = obj.likely_questions;
  if (!Array.isArray(v)) return undefined;
  const validCats = ['behavioral', 'technical', 'situational', 'culture_fit'] as const;
  const out: LikelyQuestion[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const q = rec.question;
    const a = rec.suggested_approach;
    if (typeof q !== 'string' || typeof a !== 'string') continue;
    const cat = rec.category;
    const category = (typeof cat === 'string' && (validCats as readonly string[]).includes(cat))
      ? (cat as typeof validCats[number])
      : undefined;
    out.push({ question: q, category, suggestedApproach: a });
  }
  return out;
}

function getGaps(obj: Record<string, unknown>): Array<{ gap: string; mitigation: string }> | undefined {
  const v = obj.gaps_to_address;
  if (!Array.isArray(v)) return undefined;
  const out: Array<{ gap: string; mitigation: string }> = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.gap === 'string' && typeof rec.mitigation === 'string') {
      out.push({ gap: rec.gap, mitigation: rec.mitigation });
    }
  }
  return out;
}

function getQuestionsToAsk(obj: Record<string, unknown>): Array<{ question: string; why: string }> | undefined {
  const v = obj.questions_to_ask;
  if (!Array.isArray(v)) return undefined;
  const out: Array<{ question: string; why: string }> = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.question === 'string' && typeof rec.why === 'string') {
      out.push({ question: rec.question, why: rec.why });
    }
  }
  return out;
}

export function toIntelligenceSnapshot(
  application: Application,
  data: AdapterInput,
): IntelligenceSnapshot {
  const snap: IntelligenceSnapshot = {
    company: application.company,
    jobTitle: application.title,
    applicationId: application.id,
  };

  if (data.brief) {
    const b = data.brief.brief_data;
    snap.companyResearch = {
      overview: getString(b, 'overview'),
      culture: getString(b, 'culture'),
      headcount: getString(b, 'headcount'),
      fundingStage: getString(b, 'funding_stage'),
      glassdoor: getString(b, 'glassdoor_summary'),
      techStack: getStringArray(b, 'tech_stack'),
      whyGoodFit: getString(b, 'why_good_fit'),
      redFlags: getString(b, 'red_flags'),
      recentNews: getStringArray(b, 'recent_news'),
      questionsToResearch: getStringArray(b, 'questions_to_research'),
    };
  }

  if (data.preps.length > 0) {
    const latest = [...data.preps].sort(
      (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
    )[0];
    const p = latest.prep_data;
    snap.interviewPrep = {
      careerNarrativeAngle: getString(p, 'career_narrative_angle'),
      likelyQuestions: getLikelyQuestions(p),
      talkingPoints: getStringArray(p, 'talking_points'),
      gapsToAddress: getGaps(p),
      questionsToAsk: getQuestionsToAsk(p),
      stageTips: getStringArray(p, 'stage_specific_tips'),
    };
  }

  return snap;
}
