import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { isExcludedCourse, numericScore, submissionScore } from '../../supabase/functions/_shared/gradeData.js';

const source = readFileSync(new URL('../../supabase/functions/canvas/index.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.slice(source.indexOf('function safeLink('), source.indexOf('// Authenticate every request')));

test('grades-only dashboard reads profile, courses, and grade groups without course-page requests', async () => {
  const requested = [];
  const dashboard = new Function('canvasRequest', 'canvasList', 'isExcludedCourse', 'numericScore', 'submissionScore', body + '\nreturn dashboard;')(
    async (_base, route) => { requested.push(route); return { data: { name: 'Test student' } }; },
    async (_base, route) => {
      requested.push(route);
      if (route.startsWith('/api/v1/courses?')) return [{ id: 39, name: 'PHYS 009', workflow_state: 'available', apply_assignment_group_weights: true, enrollments: [{ type: 'student', computed_current_score: 85, computed_current_grade: 'B' }] }];
      if (route.startsWith('/api/v1/courses/39/assignment_groups?')) return [{ id: 1, name: 'Quizzes', group_weight: 30, rules: { drop_lowest: 1 }, assignments: [{ id: 7, name: 'Quiz 1', points_possible: 10, html_url: 'https://canvas.example/courses/39/assignments/7', submission: { score: 8.5, workflow_state: 'graded' } }] }];
      throw Error('Unexpected Canvas request: ' + route);
    }, isExcludedCourse, numericScore, submissionScore,
  );
  const result = await dashboard('https://canvas.example', 'synthetic-token');
  assert.equal(requested.length, 3);
  assert.equal(result.courses[0].grade, 85);
  assert.equal(result.courses[0].letter, 'B');
  assert.equal(result.courses[0].groups[0].rules.dropLowest, 1);
  assert.equal(result.courses[0].groups[0].weight, 30);
  assert.equal(result.courses[0].assignments[0].earned, 8.5);
  assert.equal(result.courses[0].assignments[0].htmlUrl, 'https://canvas.example/courses/39/assignments/7');
});
