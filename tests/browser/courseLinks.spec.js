import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, context }) => {
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Original destination</h1>' }));
  await page.route('**/src/canvasApi.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function loadCourseFile(){throw new Error('Unexpected file download');}
    export async function loadAssignmentLaunch(){throw new Error('Unexpected assignment launch');}
    export async function loadModuleLaunch(courseId,moduleId,itemId){
      window.moduleRequests ??= []; window.moduleRequests.push([courseId,moduleId,itemId]);
      return {kind:'form',action:'https://provider.example/launch',fields:[{name:'lti_message_hint',value:courseId+':'+moduleId+':'+itemId}]};
    }` }));
});

for (const courseId of [4, 82716]) {
  test(`rendered links open the correct resource and course for ${courseId}`, async ({ page }) => {
    await page.goto(`/tests/courseLinks.html?course=${courseId}`);
    for (const [name, expected] of [['Reading assignment', `${courseId}:assignment:72`], ['Practice quiz', `${courseId}:quiz:73`],
      ['Schedule preview', `${courseId}:file:76`], ['Cross-course handout', '29:file:77']]) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page.getByTestId('destination')).toHaveText(expected);
    }
    await page.goBack();
    await expect(page.getByTestId('destination')).toHaveText(`${courseId}:file:76`);
  });
}

test('unsupported destinations remain exact usable links instead of changing to Modules or an error card', async ({ page, context }) => {
  await page.goto('/tests/courseLinks.html?course=4');
  for (const [name, path] of [['Specific module item', '/courses/4/modules/items/88'], ['Canvas tool action', '/courses/4/external_tools/retrieve?assignment_id=72']]) {
    const opened = context.waitForEvent('page');
    await page.getByRole('link', { name, exact: true }).click();
    const tab = await opened;
    await expect(tab).toHaveURL(`https://canvas.example${path}`);
    await expect(page.getByTestId('destination')).toHaveText('none');
    await tab.close();
  }
});

test('Ctrl/Cmd-click keeps the real Canvas URL available', async ({ page, context }) => {
  await page.goto('/tests/courseLinks.html?course=4');
  // Assert the browser's actual navigation request. Headless Chromium can crash
  // a background tab when evaluating its document; the destination contract
  // does not depend on running assertions inside Canvas's renderer.
  const navigation = context.waitForEvent('request', request => request.isNavigationRequest() && request.url().startsWith('https://canvas.example/'));
  await page.getByRole('link', { name: 'Reading assignment', exact: true }).click({ modifiers: ['ControlOrMeta'], noWaitAfter: true });
  expect((await navigation).url()).toBe('https://canvas.example/courses/4/assignments/72');
  await expect(page).toHaveURL(/\/tests\/courseLinks.html\?course=4$/);
  await expect(page.getByTestId('destination')).toHaveText('none');
});

test('module tool click preserves course, module and item identity through its form POST', async ({ page, context }) => {
  let posted;
  await context.route('https://provider.example/launch', route => {
    posted = { method: route.request().method(), body: new URLSearchParams(route.request().postData()) };
    return route.fulfill({ contentType: 'text/html', body: '<h1>Module quiz results</h1>' });
  });
  await page.goto('/tests/courseLinks.html?course=82716');
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open External module quiz' }).click();
  const tab = await opened;
  await expect(tab.getByRole('heading', { name: 'Module quiz results' })).toBeVisible();
  expect(posted.method).toBe('POST');
  expect(posted.body.get('lti_message_hint')).toBe('82716:8:99');
  expect(await page.evaluate(() => window.moduleRequests)).toEqual([[82716, 8, 99]]);
});
