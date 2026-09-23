// Shared by the Canvas adapter and browser so blank/invalid grades never become zero.
export function numericScore(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

export function submissionScore(submission) {
  if (!submission) return null;
  const score = numericScore(submission.score);
  const state = submission.workflow_state;
  const graded = state === 'graded' || submission.graded_at || submission.grader_id != null;
  // A quiz awaiting review may carry a provisional score. Preserve previous
  // graded attempts on resubmission, but do not present pending work as a zero.
  return state && !graded ? null : score;
}

export function isExcludedCourse(course) {
  const name = String(course?.name ?? '').trim();
  const label = `${name} ${course?.course_code || course?.code || ''}`;
  return /^(placement exam:|shape student training\b)/i.test(name)
    || /academic success/i.test(name)
    || /^(?:[A-Z]\d{2}-)?CSE\s*001(?:\s+\d{2})?$/i.test(name)
    || (/\bSE\s*25\b/i.test(label) && /\b(college\s+readiness|chemistry)\b/i.test(label));
}
