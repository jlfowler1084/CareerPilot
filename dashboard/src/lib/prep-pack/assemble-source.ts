// dashboard/src/lib/prep-pack/assemble-source.ts
import type { IntelligenceSnapshot } from './types';

function nonEmpty(s: string | undefined | null): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function bulletList(items: string[] | undefined): string {
  if (!items || items.length === 0) return '';
  return items.map((x) => `- ${x.trim()}`).join('\n');
}

export function assembleSource(intel: IntelligenceSnapshot, customFocus: string): string {
  const sections: string[] = [];

  // Custom Focus → ### Instructions block (only when non-empty).
  // SB-Autobook parses this block at the head of the source file and forwards
  // it to the planner as authoritative emphasis/exclusion guidance.
  // See AutobookCmdlets.ps1:735–747.
  if (nonEmpty(customFocus)) {
    sections.push(`### Instructions\n${customFocus.trim()}`);
  }

  sections.push(`# ${intel.company} — ${intel.jobTitle} — Interview Prep`);

  const cr = intel.companyResearch ?? {};
  const ip = intel.interviewPrep ?? {};

  if (nonEmpty(ip.careerNarrativeAngle)) {
    sections.push(`## Career Narrative Angle\n${ip.careerNarrativeAngle.trim()}`);
  }

  if (nonEmpty(cr.whyGoodFit)) {
    sections.push(`## Why This Role Fits\n${cr.whyGoodFit.trim()}`);
  }

  // Company Snapshot — only include if at least one subfield is present
  const snapshotBullets: string[] = [];
  if (nonEmpty(cr.culture))      snapshotBullets.push(`- Culture: ${cr.culture.trim()}`);
  if (nonEmpty(cr.headcount))    snapshotBullets.push(`- Headcount: ${cr.headcount.trim()}`);
  if (nonEmpty(cr.fundingStage)) snapshotBullets.push(`- Funding / Stage: ${cr.fundingStage.trim()}`);
  if (nonEmpty(cr.glassdoor))    snapshotBullets.push(`- Glassdoor: ${cr.glassdoor.trim()}`);
  if (snapshotBullets.length > 0) {
    sections.push(`## Company Snapshot\n${snapshotBullets.join('\n')}`);
  }

  if (cr.techStack && cr.techStack.length > 0) {
    sections.push(`## Tech Stack\n${bulletList(cr.techStack)}`);
  }

  if (cr.recentNews && cr.recentNews.length > 0) {
    sections.push(`## Recent News\n${bulletList(cr.recentNews)}`);
  }

  if (nonEmpty(cr.redFlags)) {
    sections.push(`## Red Flags to Be Aware Of\n${cr.redFlags.trim()}`);
  }

  if (ip.likelyQuestions && ip.likelyQuestions.length > 0) {
    const blocks = ip.likelyQuestions
      .map((q) => `### ${q.question.trim()}\n${q.suggestedApproach.trim()}`)
      .join('\n\n');
    sections.push(`## Likely Interview Questions\n\n${blocks}`);
  }

  if (ip.gapsToAddress && ip.gapsToAddress.length > 0) {
    const blocks = ip.gapsToAddress
      .map((g) => `**Gap:** ${g.gap.trim()}\n**Mitigation:** ${g.mitigation.trim()}`)
      .join('\n\n');
    sections.push(`## Gaps to Address\n\n${blocks}`);
  }

  if (ip.talkingPoints && ip.talkingPoints.length > 0) {
    sections.push(`## Talking Points\n${bulletList(ip.talkingPoints)}`);
  }

  if (ip.questionsToAsk && ip.questionsToAsk.length > 0) {
    const blocks = ip.questionsToAsk
      .map((q) => `**Q:** ${q.question.trim()}\n**Why:** ${q.why.trim()}`)
      .join('\n\n');
    sections.push(`## Questions to Ask Them\n\n${blocks}`);
  }

  if (cr.questionsToResearch && cr.questionsToResearch.length > 0) {
    sections.push(`## Questions to Research Before the Interview\n${bulletList(cr.questionsToResearch)}`);
  }

  if (ip.stageTips && ip.stageTips.length > 0) {
    sections.push(`## Stage Tips\n${bulletList(ip.stageTips)}`);
  }

  return sections.join('\n\n') + '\n';
}
