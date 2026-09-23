import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const apiExports = [...readFileSync('src/canvasApi.js', 'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(match => match[1]);
test.use({ hasTouch: true, isMobile: true });

for (const [width, theme] of [[320, 'light'], [390, 'dark']]) {
  test(`mobile checkbox, long categories and pending grades at ${width}px`, async ({ page }, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const pending = { id: 2, title: 'The Secret of Photo 51', points: 20, earned: null, graded: false, submitted: false, dueAt: new Date(Date.now() + 86400000).toISOString() };
    const graded = { id: 1, title: 'Course activity for financial aid', points: 2, earned: 2, graded: true, submitted: true, dueAt: pending.dueAt };
    const course = { id: 169, name: 'ANTH 169', grade: 100, letter: 'A', assignments: [graded, pending], groups: Array.from({ length: 13 }, (_, i) => ({ id: i + 1, name: i ? `Category ${i + 1} with a longer instructor label` : 'Activities', rules: {}, weight: 0, assignments: i ? [] : [graded, pending] })) };
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(value => localStorage.setItem('moofie-theme', value), theme);
    await page.route('https://**/*', route => route.abort());
    await page.route('**/src/supabase.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const isSupabaseConfigured=true; export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'mobile-test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};` }));
    await page.route('**/src/pushNotifications.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const getPushNotificationStatus=async()=>'unsupported';export const enablePushNotifications=async()=>{};export const disablePushNotifications=async()=>{};` }));
    await page.route('**/src/canvasApi.js', route => route.fulfill({ contentType: 'text/javascript', body: apiExports.map(name => name === 'loadCanvasDashboard'
      ? `export async function ${name}(){window.dashboardReads=(window.dashboardReads||0)+1;return ${JSON.stringify({ profile: { name: 'Test student' }, courses: [course, { ...course, id: 200, name: 'College Readiness SE25' }, { ...course, id: 201, name: 'Chemistry SE25' }] })};}`
      : `export function ${name}(){throw Error('Unexpected request: ${name}');}`).join('\n') }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My grades' })).toBeVisible();
    await expect(page.locator('.grade-card')).toHaveCount(1);
    await page.getByTitle('Show upcoming assignments').tap();
    const checkbox = page.getByRole('checkbox', { name: 'Mark The Secret of Photo 51 finished', exact: true });
    await expect(checkbox).toBeVisible();
    const box = await checkbox.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    // Tiny finger movements on a control must not be claimed by pull-to-refresh.
    expect(await checkbox.evaluate(button => {
      const touch = new Touch({ identifier: 1, target: button, clientX: 20, clientY: 20 });
      button.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch] }));
      const moved = new Touch({ identifier: 1, target: button, clientX: 20, clientY: 24 });
      const event = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [moved] });
      button.dispatchEvent(event);
      button.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));
      return event.defaultPrevented;
    })).toBe(false);
    await checkbox.tap();
    const checked = page.getByRole('checkbox', { name: 'Mark The Secret of Photo 51 not finished', exact: true });
    await expect(checked).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(checked).toHaveAttribute('aria-checked', 'true');
    await checked.tap();
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    const submitted = page.getByRole('checkbox', { name: 'Course activity for financial aid was submitted' });
    await expect(submitted).toHaveAttribute('aria-checked', 'true');
    expect(await submitted.locator('.assignment-complete-mark').evaluate(mark => getComputedStyle(mark).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('mobile-dashboard.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Open ANTH 169', exact: true }).tap();
    const summary = page.getByRole('button', { name: 'Show 13 categories', exact: true });
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#grade-category-breakdown')).toBeHidden();
    expect((await page.locator('.grade-overview').boundingBox()).height).toBeLessThan(210);
    await expect(page.locator('.large-grade')).toContainText('100%');
    await expect(page.getByRole('spinbutton', { name: 'Score for The Secret of Photo 51', exact: true })).toHaveValue('');
    await expect(page.getByText('Ungraded', { exact: true })).toBeVisible();
    await summary.tap();
    await expect(page.locator('#grade-category-breakdown .grade-overview-row:not(.headings)')).toHaveCount(13);
    await page.getByRole('button', { name: 'Hide categories', exact: true }).tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('mobile-course.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}
