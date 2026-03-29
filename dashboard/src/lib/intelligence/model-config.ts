// Cost-optimized model routing for Career Intelligence Engine
// Per SCRUM-178 spec: Haiku for extraction/summarization, Sonnet for reasoning

export const INTELLIGENCE_MODELS = {
  company_brief: {
    model: process.env.MODEL_HAIKU || 'claude-haiku-4-5-20251001',
    justification: 'Simple extraction + formatting of web search results',
    maxTokens: 2000,
  },
  skill_extraction: {
    model: process.env.MODEL_HAIKU || 'claude-haiku-4-5-20251001',
    justification: 'Keyword extraction, no reasoning needed',
    maxTokens: 1000,
  },
  debrief_analysis: {
    model: process.env.MODEL_HAIKU || 'claude-haiku-4-5-20251001',
    justification: 'Summarize/extract patterns from user notes',
    maxTokens: 1500,
  },
  interview_prep: {
    model: process.env.MODEL_SONNET || 'claude-sonnet-4-20250514',
    justification:
      'JD vs resume gap analysis + question generation requires reasoning',
    maxTokens: 3000,
  },
  practice_scenarios: {
    model: process.env.MODEL_SONNET || 'claude-sonnet-4-20250514',
    justification: 'Creative scenario generation tied to experience',
    maxTokens: 3000,
  },
  transcript_analysis: {
    model: process.env.MODEL_SONNET || 'claude-sonnet-4-20250514',
    justification: 'Nuanced conversation analysis',
    maxTokens: 3000,
  },
} as const;

export type IntelligenceType = keyof typeof INTELLIGENCE_MODELS;

export function getModelConfig(type: IntelligenceType) {
  return INTELLIGENCE_MODELS[type];
}
