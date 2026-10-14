import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeSnapshots, gradeChanged, notificationFor } from '../../supabase/functions/_shared/gradeNotifications.js';
import { updateGradeHistory } from './gradeNotifications.js';

const course = { id: 1, name: 'PHYS 009', grade: 80, letter: 'B', assignments: [{ id: 2, title: 'Quiz', points: 10, earned: 8, grade: '8', gradedAt: '2026-10-01T12:00:00Z' }] };
test('new assignments and pending scores do not alert; newly posted zero grades do', () => {
  const previous = gradeSnapshots([course], 'A');
  const pending = gradeSnapshots([{ ...course, assignments: [{ id: 3, earned: 0, graded: false, points: 20 }] }], 'A')[1];
  assert.equal(gradeChanged(null, pending), false);
  assert.equal(gradeChanged(pending, { ...pending, score: 0 }), true);
  assert.equal(gradeChanged(previous[1], { ...previous[1], score: null }), false);
});
test('assignment grades, points, regrades and overall grade changes alert without assignment-edit noise', () => {
  const [overall, assignment] = gradeSnapshots([course], 'A');
  for (const change of [{ score: 9 }, { points_possible: 12 }, { grade: 'complete' }, { graded_at: '2026-10-02T12:00:00Z' }]) assert.equal(gradeChanged(assignment, { ...assignment, ...change }), true);
  assert.equal(gradeChanged(overall, { ...overall, score: 90, grade: 'A' }), true);
  assert.equal(gradeChanged(overall, { ...overall, grade: 'B+' }), true);
  assert.equal(gradeChanged(assignment, { ...assignment, assignment_title: 'Renamed', updated_at: '2026-10-03T00:00:00Z' }), false);
  assert.match(notificationFor([{ ...overall, score: 90 }]).title, /overall grade updated/);
});
test('bell history detects score-only changes, retains read history and ignores new ungraded assignments', () => {
  const initial = updateGradeHistory(null, [course], 'A', '2026-10-01T15:00:00Z');
  assert.ok(initial.events.every(item => item.observedAt <= '2026-10-01T15:00:00Z'));
  const changedCourse = { ...course, grade: 90, assignments: [{ ...course.assignments[0], earned: 9 }, { id: 4, title: 'New assignment', points: 20, earned: null }] };
  const changed = updateGradeHistory(initial, [changedCourse], 'A', '2026-10-02T15:00:00Z');
  assert.equal(changed.events.filter(item => item.observedAt === '2026-10-02T15:00:00Z').length, 2);
  assert.equal(changed.events.some(item => item.assignment_id === 4), false);
  assert.deepEqual(updateGradeHistory(changed, [changedCourse], 'A', '2026-10-03T15:00:00Z').events, changed.events);
  assert.equal(updateGradeHistory(changed, [{ ...changedCourse, name: 'Orientation 2026-2027' }], 'A').events.length, 0);
});
