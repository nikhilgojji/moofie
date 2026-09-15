import test from 'node:test';
import assert from 'node:assert/strict';
import { quizAssignmentNavigation } from './quizAssignment.js';
import { quizDetails } from '../../supabase/functions/canvas/quizDetails.ts';

test('quiz-backed assignments preserve distinct quiz and course identity from every assignment entry', () => {
  for (const courseId of [4, 39, 82716]) {
    const result = quizAssignmentNavigation({ type: 'assignment', courseId, sectionId: 'course-assignments' }, { id: 72, quizId: 91, title: 'Lecture quiz 2' });
    assert.equal(result.moofieViewer.item.id, 91);
    assert.equal(result.moofieViewer.courseId, courseId);
    assert.equal(result.moofieViewer.type, 'quiz');
    assert.equal(result.moofieViewer.sectionId, 'course-quizzes');
    assert.equal(result.moofieView, 'home');
    assert.equal(result.moofieHomeCourse, courseId);
    assert.equal(result.moofieGradeAssignment, null);
  }
  assert.equal(quizAssignmentNavigation({ type: 'assignment' }, { title: 'Quiz named file upload' }), null);
  assert.equal(quizAssignmentNavigation({ type: 'assignment' }, { submissionTypes: ['external_tool'], quizId: null }), null);
});

const quiz = { id: 91, title: 'Lecture quiz 2', question_count: 2, points_possible: 2, time_limit: null, lock_at: '2026-09-14T20:56:00Z' };
test('an in-progress quiz exposes its exact resume destination and source metadata with read-only current-user requests', async () => {
  const paths = [];
  const result = await quizDetails(quiz, 39, 'https://canvas.example', async path => {
    paths.push(path);
    return { quiz_submissions: [{ quiz_id: 91, workflow_state: 'untaken', started_at: '2026-09-14T20:45:00Z', finished_at: null }] };
  });
  assert.deepEqual(paths, ['/api/v1/courses/39/quizzes/91/submission']);
  assert.deepEqual(result.action, { label: 'Resume Quiz', url: 'https://canvas.example/courses/39/quizzes/91/take' });
  assert.equal(result.questionCount, 2); assert.equal(result.timeLimit, null); assert.equal(result.lockAt, quiz.lock_at);
});

test('missing, completed, restricted or unrelated attempts never invent a resumable quiz', async () => {
  for (const submissions of [[], [{ quiz_id: 92, workflow_state: 'untaken', started_at: '2026-09-14' }], [{ quiz_id: 91, workflow_state: 'complete', started_at: '2026-09-14', finished_at: '2026-09-14' }]]) {
    const result = await quizDetails(quiz, 39, 'https://canvas.example', async () => ({ quiz_submissions: submissions }));
    assert.equal(result.action.label, 'Open Quiz in Canvas');
    assert.equal(result.action.url, 'https://canvas.example/courses/39/quizzes/91');
  }
  const result = await quizDetails(quiz, 39, 'https://canvas.example', async () => { throw Error('restricted'); });
  assert.equal(result.attemptAvailable, false);
  assert.equal(result.action.label, 'Open Quiz in Canvas');
});
