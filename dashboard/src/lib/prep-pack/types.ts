// dashboard/src/lib/prep-pack/types.ts

export type Voice = 'Steffan' | 'Aria' | 'Jenny' | 'Guy';
export type Depth = 'Quick' | 'Standard' | 'Deep';
export type Mode = 'Single' | 'Series';
export type KindleFormat = 'KFX' | 'AZW3';

export interface WizardConfig {
  voice: Voice;
  depth: Depth;
  mode: Mode;
  produceKindle: boolean;
  kindleFormat: KindleFormat;
  customFocus: string;
}

/**
 * Subset of CareerPilot's Intelligence record consumed by the assembler.
 * Field names mirror the Supabase column names returned by
 * /api/intelligence/[applicationId].
 *
 * All string fields may be empty; arrays may be empty. Empty fields are
 * silently omitted by the assembler.
 */
export interface IntelligenceSnapshot {
  company: string;
  jobTitle: string;
  applicationId: string;

  companyResearch?: {
    overview?: string;
    culture?: string;
    headcount?: string;
    fundingStage?: string;
    glassdoor?: string;
    techStack?: string[];
    whyGoodFit?: string;
    redFlags?: string;
    recentNews?: string[];
    questionsToResearch?: string[];
  };

  interviewPrep?: {
    careerNarrativeAngle?: string;
    likelyQuestions?: Array<{
      question: string;
      category?: 'behavioral' | 'technical' | 'situational' | 'culture_fit';
      suggestedApproach: string;
    }>;
    talkingPoints?: string[];
    gapsToAddress?: Array<{ gap: string; mitigation: string }>;
    questionsToAsk?: Array<{ question: string; why: string }>;
    stageTips?: string[];
  };
}

export interface PrepPackJobRequest {
  intelligence: IntelligenceSnapshot;
  config: WizardConfig;
  /** Final edited source text from the wizard's preview pane */
  sourceText: string;
}

export interface PrepPackJobResponse {
  status: 'started' | 'rejected';
  jobStem: string;
  inputPath: string;
  expectedOutputs: {
    vaultNote: string;
    mp3: string;
    kindle?: string;
  };
  /** Present only when status === 'rejected' */
  reason?: string;
}
