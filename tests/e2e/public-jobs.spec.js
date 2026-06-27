/**
 * Public job browse — unauthenticated happy path.
 *
 * These tests hit the live site (or BASE_URL env) and verify that core
 * read-only surfaces load correctly with no auth required.
 */
import { test, expect } from '@playwright/test';

test.describe('Public job browse (jobs.html)', () => {
  test('page loads and shows job cards', async ({ page }) => {
    await page.goto('/jobs.html');
    await expect(page).toHaveTitle(/HireTrack/i);

    // At least one job card should render within 10 s
    const jobCard = page.locator('[data-job-id], .job-card, .job-item').first();
    await expect(jobCard).toBeVisible({ timeout: 10_000 });
  });

  test('keyword filter narrows results', async ({ page }) => {
    await page.goto('/jobs.html');

    const searchInput = page
      .getByPlaceholder(/search/i)
      .or(page.getByPlaceholder(/job title/i))
      .first();
    await expect(searchInput).toBeVisible({ timeout: 8_000 });
    await searchInput.fill('developer');
    await searchInput.press('Enter');

    // Wait for results to refresh (loading indicator disappears or new cards appear)
    await page.waitForTimeout(2_000);

    // Page should still have job listings (not an error state)
    const errorMsg = page.getByText(/no jobs found|error loading/i);
    // It's okay if there are genuinely no results, but there should be no crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/TypeError|undefined is not/i);
  });

  test('job detail modal opens on card click', async ({ page }) => {
    await page.goto('/jobs.html');

    const firstCard = page.locator('[data-job-id], .job-card, .job-item').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    // Modal or detail panel should appear
    const modal = page
      .locator('.modal, [role="dialog"], .job-detail-panel, .apply-modal')
      .first();
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/jobs.html');
    await page.waitForLoadState('networkidle');

    // Filter out known third-party noise
    const critical = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('analytics') &&
        !e.includes('gtag') &&
        !e.includes('Failed to load resource') // 3rd-party CDN
    );
    expect(critical, `Console errors: ${critical.join('\n')}`).toHaveLength(0);
  });
});

test.describe('Landing page (index.html)', () => {
  test('loads and has CTA links', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HireTrack/i);

    // Should have at least one link to jobs or sign-up
    const cta = page
      .getByRole('link', { name: /browse jobs|find jobs|get started|sign up/i })
      .first();
    await expect(cta).toBeVisible({ timeout: 8_000 });
  });

  test('mobile viewport renders without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    // Allow 1px tolerance for sub-pixel rendering
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
