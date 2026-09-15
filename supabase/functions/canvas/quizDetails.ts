// Read only the current user's attempt. Never start or submit a quiz on a page read.
export async function quizDetails(quiz: any, courseId: number, canvasUrl: string, readApi: (path: string) => Promise<any>) {
  let attempt = null;
  let attemptAvailable = false;
  try {
    const result = await readApi(`/api/v1/courses/${courseId}/quizzes/${quiz.id}/submission`);
    const attempts = (result?.quiz_submissions || []).filter((value: any) => Number(value.quiz_id) === Number(quiz.id));
    const current = attempts.find((value: any) => value.workflow_state === 'untaken' && value.started_at && !value.finished_at)
      || attempts.sort((a: any, b: any) => Number(b.attempt) - Number(a.attempt))[0];
    attemptAvailable = true;
    if (current) attempt = { state: current.workflow_state, startedAt: current.started_at || null, finishedAt: current.finished_at || null };
  } catch { /* Keep the quiz accessible when attempt information is unavailable. */ }
  const htmlUrl = new URL(`/courses/${courseId}/quizzes/${quiz.id}`, canvasUrl).href;
  const resume = attempt?.state === 'untaken' && attempt.startedAt && !attempt.finishedAt;
  return {
    id: quiz.id, title: quiz.title, description: quiz.description || '',
    dueAt: quiz.due_at || null, lockAt: quiz.lock_at || null, unlockAt: quiz.unlock_at || null,
    locked: Boolean(quiz.locked_for_user), lockExplanation: quiz.lock_explanation || null,
    questionCount: quiz.question_count ?? null, points: quiz.points_possible ?? null,
    timeLimit: quiz.time_limit ?? null, allowedAttempts: quiz.allowed_attempts ?? null,
    quizType: quiz.quiz_type, htmlUrl, attemptAvailable,
    action: { label: resume ? 'Resume Quiz' : 'Open Quiz in Canvas', url: resume ? `${htmlUrl}/take` : htmlUrl },
  };
}
