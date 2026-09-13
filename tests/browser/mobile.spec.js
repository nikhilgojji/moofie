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
for (const theme of ['light', 'dark']) {
  test(`mobile course menu and document controls work in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`/tests/mobile.html?view=navigation&theme=${theme}`);
    const menu = page.getByRole('button', { name: /Course menu/ });
    await expect(page.getByRole('button', { name: 'Assignments', exact: true })).toBeHidden();
    await menu.click();
    await page.getByRole('button', { name: 'Assignments', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'assignments' })).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click(); await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
    await page.screenshot({ path: `test-results/navigation-${theme}.png`, fullPage: true });
    await page.goto(`/tests/mobile.html?view=document&theme=${theme}`);
    for (const name of ['Zoom in', 'Zoom out', 'Rotate clockwise', 'Enter fullscreen', 'Next page']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: 'Page number' })).toHaveValue('2');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.getByRole('button', { name: '115%' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/document-${theme}.png`, fullPage: true });
  });
}
