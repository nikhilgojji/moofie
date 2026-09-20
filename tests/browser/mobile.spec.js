import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  // Never contact a real account from these synthetic-data fixtures.
  await page.route('https://**/*', route => route.abort());
});
for (const width of [320, 390, 768, 1280]) {
  test(`gradebook remains readable and editable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/tests/mobile.html');
    await expect(page.locator('.assignment-name-button')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const score = page.locator('.score-input input');
    await score.fill('95');
    await expect(page.getByText('What-if changes are active.')).toBeVisible();
    await page.getByRole('button', { name: 'Reset what-if grades' }).click();
    await expect(score).toHaveValue('90');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.topbar')).toBeInViewport();
    await page.screenshot({ path: `test-results/gradebook-${width}.png`, fullPage: true });
  });
}
