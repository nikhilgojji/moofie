import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const exports = [...readFileSync('src/canvasApi.js', 'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(match => match[1]);

for (const entry of ['assignments', 'quizzes', 'grades']) {
  test(`${entry} opens the real quiz view and resumes the same quiz rather than displaying an upload assignment`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(entry === 'assignments' ? { width: 1440, height: 900 } : { width: 390, height: 844 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/canvasApi.js', route => route.fulfill({ contentType: 'text/javascript', body: exports.map(name => {
      if (name === 'loadAssignmentDetails') return `export async function ${name}(course,id){window.quizReads??=[];window.quizReads.push(['assignment',course,id]);return {id:72,quizId:91,title:'Lecture quiz 2',submissionTypes:['online_quiz']};}`;
      if (name === 'loadCourseContent') return `export async function ${name}(course,kind,id){window.quizReads??=[];window.quizReads.push([kind,course,id]);return {id:91,title:'Lecture quiz 2',questionCount:2,points:2,timeLimit:null,lockAt:'2026-09-14T20:56:00Z',dueAt:'2026-09-14T20:56:00Z',action:{label:'Resume Quiz',url:'https://canvas.example/courses/'+course+'/quizzes/'+id+'/take'}};}`;
      return `export function ${name}(){throw new Error('Unexpected API call: ${name}');}`;
    }).join('\n') }));
    await context.route('https://canvas.example/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Canvas quiz attempt</h1>' }));
    await page.goto(`/tests/quizAssignment.html?entry=${entry}&course=82716`);
    await expect(page.getByRole('link', { name: 'Resume Quiz', exact: true })).toBeVisible();
    await expect(page.getByLabel('Quiz details')).toContainText('Questions 2');
    await expect(page.getByLabel('Quiz details')).toContainText('Time Limit None');
    await expect(page.getByText('No online submission', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Submission', exact: true })).toHaveCount(0);
    const state = await page.evaluate(() => history.state.moofieViewer);
    expect(state.type).toBe('quiz'); expect(state.item.id).toBe(91); expect(state.sectionId).toBe('course-quizzes');
    expect(await page.evaluate(() => window.quizReads)).toEqual(entry !== 'quizzes' ? [['assignment',82716,72],['quiz',82716,91]] : [['quiz',82716,91]]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('quiz-view.png'), fullPage: true });
    const popup = context.waitForEvent('page');
    await page.getByRole('link', { name: 'Resume Quiz' }).click();
    await expect(await popup).toHaveURL('https://canvas.example/courses/82716/quizzes/91/take');
    expect(errors).toEqual([]);
  });
}
