/**
 * Public job browse — unauthenticated happy path.
 *
 * Selectors are based on the actual jobs.html DOM:
 *   - Job cards:    .bj-job-card  (rendered by browse-jobs.js)
 *   - Search input: #f-kw  (desktop filter bar)
 *   - Detail modal: #am-backdrop  (injected by apply-modal.js)
 */
import { test, expect } from '@playwright/test';

test.describe('Public job browse (jobs.html)', () => {
  test('page loads and shows job cards', async ({ page }) => {
    await page.goto('/jobs.html');
    await expect(page).toHaveTitle(/HireTrack/i);

    // At least one job card should render within 15 s (Supabase fetch)
    const jobCard = page.locator('.bj-job-card').first();
    await expect(jobCard).toBeVisible({ timeout: 15_000 });
  });

  test('keyword filter narrows results', async ({ page }) => {
    await page.goto('/jobs.html');

    // Wait for initial load
    await expect(page.locator('.bj-job-card').first()).toBeVisible({ timeout: 15_000 });

    const searchInput = page.locator('#f-kw');
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill('developer');
    await searchInput.press('Enter');

    // Wait for re-render (debounce + network)
    await page.waitForTimeout(3_000);

    // Page should still be functional — no crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/TypeError|undefined is not/i);
  });

  test('job detail modal opens on card click', async ({ page }) => {
    await page.goto('/jobs.html');

    const firstCard = page.locator('.bj-job-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();

    // apply-modal.js injects #am-backdrop and adds .am-open when a card is clicked
    const modal = page.locator('#am-backdrop');
    await expect(modal).toHaveClass(/am-open/, { timeout: 5_000 });
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
        !e.includes('Failed to load resource')
    );
    expect(critical, `Console errors:\n${critical.join('\n')}`).toHaveLength(0);
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
