import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { isExcludedCourse, numericScore, submissionScore } from '../../supabase/functions/_shared/gradeData.js';
import { calculateCourseGrade } from './gradebook.js';
import { sanitizeDashboard, readDashboardCache, writeDashboardCache } from './dashboardCache.js';

const source = readFileSync(new URL('../../supabase/functions/canvas/index.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.slice(source.indexOf('function safeLink('), source.indexOf('// Authenticate every request')));
const anth = { id: 169, name: 'ANTH 169', workflow_state: 'available', enrollments: [{ type: 'student', computed_current_score: 100, computed_final_score: 9.09, computed_final_grade: 'F' }] };
const assignments = [
  { id: 1, name: 'Course activity for financial aid', points_possible: 2, submission: { score: 2, grade: '2', workflow_state: 'graded' } },
  { id: 2, name: 'The Secret of Photo 51', points_possible: 20, submission: { score: 0, grade: null, workflow_state: 'pending_review', submitted_at: '2026-09-22', graded_at: null, grader_id: null } },
];
async function dashboard(courses = [anth]) {
  const load = new Function('canvasRequest', 'canvasList', 'isExcludedCourse', 'numericScore', 'submissionScore', body + '\nreturn dashboard;')(
    async () => ({ data: { name: 'Test student' } }),
    async (_url, route) => route.startsWith('/api/v1/courses?') ? courses : [{ id: 1, name: 'Activities', assignments }],
    isExcludedCourse, numericScore, submissionScore,
  );
  return load('https://canvas.example', 'test-only');
}

test('2/2 plus a pending 20-point quiz remains 100%, with a blank pending score', async () => {
  const result = sanitizeDashboard(await dashboard());
  const course = result.courses[0];
  assert.equal(course.grade, 100);
  assert.equal(course.letter, 'A');
  assert.equal(course.assignments[1].earned, null);
  assert.equal(course.assignments[1].graded, false);
  const values = Object.fromEntries(course.assignments.map(a => [a.id, a.earned ?? '']));
  assert.equal(calculateCourseGrade(course, values), 100);
});

test('missing current grades never fall back to zero-inclusive final grades', async () => {
  const result = await dashboard([{ ...anth, enrollments: [{ type: 'student', computed_current_score: null, computed_final_score: 0, computed_final_grade: 'F' }] }]);
  assert.equal(result.courses[0].grade, null);
  assert.equal(result.courses[0].letter, null);
});

test('real zero grades remain zero; blank, invalid and provisional values stay ungraded', () => {
  for (const value of [null, undefined, '', ' ', '🚀', 'pending', false, NaN, Infinity]) assert.equal(numericScore(value), null);
  assert.equal(submissionScore({ score: 0, workflow_state: 'graded' }), 0);
  assert.equal(submissionScore({ score: '0', workflow_state: 'submitted', graded_at: '2026-09-21' }), 0);
  assert.equal(submissionScore({ score: 0, workflow_state: 'submitted', grade: null }), null);
  assert.equal(submissionScore({ score: 8, workflow_state: 'submitted', graded_at: '2026-09-21' }), 8);
  assert.equal(calculateCourseGrade({ weighted: false, groups: [{ assignments: [{ id: 1, points: 2 }, { id: 2, points: 20 }] }] }, { 1: 2, 2: '🚀' }), 100);
});

test('SE25 readiness and chemistry shells are excluded without hiding regular chemistry courses', async () => {
  for (const name of ['College Readiness SE25', 'Chemistry SE25', 'SE25 - Chemistry', 'college readiness se 25']) assert.equal(isExcludedCourse({ name }), true);
  for (const name of ['F26-CHEM 002 01', 'Chemistry F26', 'ANTH 169']) assert.equal(isExcludedCourse({ name }), false);
  const courses = [anth, ...['College Readiness SE25', 'Chemistry SE25', 'Chemistry F26'].map((name, index) => ({ ...anth, id: index + 200, name }))];
  assert.deepEqual((await dashboard(courses)).courses.map(c => c.name), ['ANTH 169', 'Chemistry F26']);
  assert.deepEqual(sanitizeDashboard({ courses }).courses.map(c => c.name), ['ANTH 169', 'Chemistry F26']);
});

test('old dashboard caches are discarded and corrected scores remain account-scoped', async () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  storage.set('moofie-dashboard-cache', JSON.stringify({ userId: 'A', cachedAt: Date.now(), data: { courses: [{ grade: 0, letter: 'F' }] } }));
  assert.equal(readDashboardCache('A').found, false);
  writeDashboardCache('A', await dashboard());
  assert.equal(readDashboardCache('A').data.courses[0].assignments[1].earned, null);
  assert.equal(readDashboardCache('B').found, false);
  delete globalThis.localStorage;
});
