export const INDEED_APPLY_STEPS = [
  { id: "navigate", label: "Navigate to job", icon: "link" },
  { id: "detect_form", label: "Detect apply form", icon: "search" },
  { id: "upload_resume", label: "Upload resume", icon: "file" },
  { id: "answer_questions", label: "Answer screening questions", icon: "edit" },
  { id: "upload_cover_letter", label: "Upload cover letter", icon: "file-text" },
  { id: "review", label: "Review submission", icon: "eye" },
  { id: "submit", label: "Submit application", icon: "send" },
  { id: "verify", label: "Verify confirmation", icon: "check-circle" },
] as const

export const DICE_APPLY_STEPS = [
  { id: "navigate", label: "Navigate to job", icon: "link" },
  { id: "detect_form", label: "Detect apply form", icon: "search" },
  { id: "upload_resume", label: "Upload resume", icon: "file" },
  { id: "submit", label: "Submit application", icon: "send" },
  { id: "verify", label: "Verify confirmation", icon: "check-circle" },
] as const

export type IndeedApplyStep = typeof INDEED_APPLY_STEPS[number]["id"]
export type DiceApplyStep = typeof DICE_APPLY_STEPS[number]["id"]

export function getStepsForSource(source: string) {
  if (source.toLowerCase() === "dice") return DICE_APPLY_STEPS
  return INDEED_APPLY_STEPS
}

export function getStepLabel(stepId: string, source: string = "indeed"): string {
  const steps = getStepsForSource(source)
  const step = steps.find((s) => s.id === stepId)
  return step?.label || stepId
}
