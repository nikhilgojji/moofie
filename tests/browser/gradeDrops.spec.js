import { test, expect } from '@playwright/test';

for (const [width, theme] of [[1280, 'light'], [390, 'dark']]) {
  test(`dropped scores stay visible and follow what-if edits at ${width}px`, async ({ page }, info) => {
    await page.route('https://**/*', route => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => localStorage.setItem('moofie-theme', value), theme);
    await page.goto(`/tests/mobile.html?case=drops&theme=${theme}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const rule = page.getByText('Drops the lowest score', { exact: true });
    await expect(rule).toBeVisible();
    await expect(page.locator('.assignment-row.is-dropped')).toContainText('Unit 01 Quiz');
    await expect(page.getByText('Total after 1 drop', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '+ Add assignment', exact: true }).click();
    await page.getByPlaceholder('Assignment name').fill('Practice quiz');
    await page.getByPlaceholder('Total pts').fill('10');
    await page.getByRole('button', { name: 'Add assignment', exact: true }).click();
    const manualScore = page.getByRole('spinbutton', { name: 'Score for Practice quiz', exact: true });
    await manualScore.fill('2');
    const dropped = page.locator('.assignment-row.is-dropped');
    await expect(dropped).toHaveCount(1);
    await expect(dropped).toContainText('Practice quiz');
    await expect(dropped).toContainText('Not counted in projected grade');
    await expect(manualScore).toHaveAccessibleDescription('Dropped · Not counted in projected grade');
    await expect(page.locator('.group-total-row .group-points')).toHaveText('25 / 30 pts');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dropped.evaluate(row => getComputedStyle(row).backgroundColor !== getComputedStyle(row.parentElement).backgroundColor)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('drop-emphasis.png'), fullPage: true, animations: 'disabled' });
    await manualScore.fill('10');
    await expect(dropped).toContainText('Unit 01 Quiz');
    await expect(page.locator('.group-total-row .group-points')).toHaveText('30 / 30 pts');
    await manualScore.fill('');
    await expect(dropped).toContainText('Unit 01 Quiz');
    await expect(page.locator('.group-total-row .group-points')).toHaveText('20 / 20 pts');
    await page.getByRole('button', { name: 'Remove Practice quiz' }).click();
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(rule).toBeVisible();
    await expect(dropped).toBeHidden();
  });
}
