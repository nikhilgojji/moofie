import { test, expect } from '@playwright/test';
for (const [device, width, userAgent] of [['desktop', 1280, 'Mozilla/5.0 Windows'], ['iPhone', 390, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'], ['Android', 390, 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36']]) {
  test.describe(device, () => {
    test.use({ userAgent, viewport: { width, height: 900 } });
    test('only grade changes create unread alerts and Canvas links target the right app', async ({ page }, info) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/src/pushNotifications.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const getPushNotificationStatus=async()=>'available';export const enablePushNotifications=async()=>'enabled';export const disablePushNotifications=async()=>'available';` }));
      await page.goto('/tests/notifications.html');
      await expect(page.locator('.notification-count')).toHaveCount(0);
      await page.getByRole('button', { name: 'Create assignment' }).click();
      await page.getByRole('button', { name: 'Edit instructions' }).click();
      await expect(page.locator('.notification-count')).toHaveCount(0);
      await page.getByRole('button', { name: 'Post grade' }).click();
      await expect(page.locator('.notification-count')).toHaveText('2');
      await page.getByLabel('Open grade notifications').click();
      await expect(page.locator('.notification-count')).toHaveCount(0);
      await expect(page.locator('.notifications-list')).toContainText('9 / 10 pts');
      await expect(page.locator('.notifications-list')).toContainText('90%');
      await expect(page.locator('.notifications-list')).not.toContainText('Ungraded work');
      const link = page.getByRole('link', { name: /Quiz 1/ });
      await expect(link).toHaveAttribute('href', device === 'desktop' ? /^https:\/\/catcourses/ : device === 'iPhone' ? /^canvas-courses:\/\/catcourses/ : /^intent:\/\/catcourses/);
      if (device === 'desktop') await expect(link).toHaveAttribute('target', '_blank');
      else await expect(link).not.toHaveAttribute('target');
      await page.getByRole('button', { name: 'Turn on', exact: true }).click();
      await expect(page.getByText('On · checks for grades every 15 minutes')).toBeVisible();
      await page.screenshot({ path: info.outputPath('grade-notifications.png'), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  });
}
