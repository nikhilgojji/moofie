import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const apiExports = [...readFileSync('src/canvasApi.js', 'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(match => match[1]);
const assignment = { id: 7, title: 'Lab report', points: 10, earned: 9, submitted: true, graded: true, submissionTypes: ['none'], htmlUrl: 'https://canvas.example/courses/39/assignments/7', description: '<p>Read <a href="/courses/39/pages/instructions">Linked instructions</a>.</p>' };
const course = { id: 39, name: 'PHYS 009', grade: 90, letter: 'A', assignments: [assignment], groups: [{ id: 1, name: 'Labs', weight: 100, assignments: [assignment], rules: {} }] };
for (const [width, legacy] of [[390, false], [1280, true]]) {
  test(`Grades replaces Home at ${width}px including Canvas links and grade navigation`, async ({ page }, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://**/*', route => route.abort());
    await page.route('**/src/supabase.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const isSupabaseConfigured=true; export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'grades-test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};` }));
    await page.route('**/src/pushNotifications.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const getPushNotificationStatus=async()=>'unsupported';export const enablePushNotifications=async()=>{};export const disablePushNotifications=async()=>{};` }));
    await page.route('**/src/canvasApi.js', route => route.fulfill({ contentType: 'text/javascript', body: apiExports.map(name => {
      if (name === 'loadCanvasDashboard') return `export async function ${name}(){return ${JSON.stringify({ courses: [course], profile: { name: 'Demo student' } })};}`;
      return `export function ${name}(){throw Error('Unexpected request: ${name}');}`;
    }).join('\n') }));
    if (legacy) await page.addInitScript(() => history.replaceState({ moofieView: 'home', moofieHomeCourse: 39, moofieHomeSection: 'course-modules' }, ''));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My grades', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => history.state.moofieView)).toBe('grades');
    await page.screenshot({ path: info.outputPath('grades-start.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Open PHYS 009', exact: true }).click();

    const assignmentLink = page.getByRole('link', { name: 'Lab report', exact: true });
    await expect(assignmentLink).toHaveAttribute('href', assignment.htmlUrl);
    await expect(assignmentLink).toHaveAttribute('target', '_blank');
    await expect(page.locator('.course-content-route')).toHaveCount(0);
    await expect(page.getByText('Checking Canvas', { exact: true })).toHaveCount(0);
    const score = page.locator('.score-input input');
    await score.fill('8');
    await expect(page.getByText('What-if changes are active.')).toBeVisible();
    await page.getByRole('button', { name: 'Reset what-if grades' }).click();
    await expect(score).toHaveValue('9');
    await page.getByRole('button', { name: '+ Add assignment', exact: true }).click();
    await page.getByPlaceholder('Assignment name').fill('Practice');
    await page.getByPlaceholder('Total pts').fill('10');
    await page.getByRole('button', { name: 'Add assignment', exact: true }).click();
    await expect(page.getByText('Practice', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Practice', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove Practice' }).click();
    await page.screenshot({ path: info.outputPath('gradebook.png'), fullPage: true, animations: 'disabled' });
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'My grades', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
