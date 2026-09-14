import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const headers = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')).headers;
const csp = headers.flatMap(entry => entry.headers).find(header => header.key === 'Content-Security-Policy').value;
async function fixture(page, fail = false) {
  await page.route('**/tests/assignment-launch.html', route => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': csp },
    body: '<button id="open">Open Quiz 1</button><p id="error" role="alert"></p><script type="module" src="/tests/assignment-launch-fixture.js"></script>' }));
  await page.route('**/tests/assignment-launch-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { openAssignmentLaunch } from '/src/utils/assignmentLaunch.js';
    let attempt=0;
    document.querySelector('#open').onclick=async()=>{
      try { await openAssignmentLaunch(async()=>{
        await Promise.resolve();
        if(${fail})throw new Error('Canvas temporarily unavailable');
        return {kind:'form',action:'https://provider.example/oidc',fields:[
          {name:'iss',value:'https://canvas.example'}, {name:'login_hint',value:'user-hint'},
          {name:'lti_message_hint',value:'quiz-99-attempt-'+(++attempt)}, {name:'submit',value:'preserved'}]};
      }); }catch(error){document.querySelector('#error').textContent=error.message;}
    };` }));
  await page.goto('/tests/assignment-launch.html');
}

test('one click POSTs the fresh assignment launch in its own tab under production CSP', async ({ page, context }) => {
  const posts = [];
  await context.route('https://provider.example/oidc', async route => {
    posts.push({ method: route.request().method(), fields: new URLSearchParams(route.request().postData()) });
    await route.fulfill({ contentType: 'text/html', body: '<h1>Quiz 1 results</h1>' });
  });
  await fixture(page);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const opened = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Open Quiz 1' }).click();
    const tab = await opened;
    await expect(tab.getByRole('heading', { name: 'Quiz 1 results' })).toBeVisible();
    expect(await tab.evaluate(() => window.opener)).toBe(null);
    expect(posts.at(-1).method).toBe('POST');
    expect(posts.at(-1).fields.get('lti_message_hint')).toBe(`quiz-99-attempt-${attempt}`);
    expect(posts.at(-1).fields.get('submit')).toBe('preserved');
    await tab.close();
  }
  expect(posts).toHaveLength(2);
});

test('failed launches close the waiting tab and leave a retryable error', async ({ page, context }) => {
  await fixture(page, true);
  await page.getByRole('button', { name: 'Open Quiz 1' }).click();
  await expect(page.getByRole('alert')).toHaveText('Canvas temporarily unavailable');
  await expect.poll(() => context.pages().length).toBe(1);
});

test('blocked popups are explained before requesting launch credentials', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', { name: 'Open Quiz 1' }).click();
  await expect(page.getByRole('alert')).toContainText('Allow pop-ups for Moofie');
});
