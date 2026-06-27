/**
 * Candidate authentication flows — signup & login.
 *
 * These tests use isolated test emails and clean up after themselves.
 * Run against a staging environment; do NOT run against production as
 * they create real Supabase Auth users.
 *
 * Set BASE_URL=https://staging.hiretrack.co.in before running.
 */
import { test, expect } from '@playwright/test';
import { testEmail } from './helpers.js';

// Skip if running against production
test.beforeEach(async ({}, testInfo) => {
  if (process.env.BASE_URL?.includes('hiretrack.co.in') && !process.env.BASE_URL?.includes('staging')) {
    testInfo.skip(true, 'Auth tests are skipped against production. Set BASE_URL to staging.');
  }
});

test.describe('Candidate signup', () => {
  test('signup page loads', async ({ page }) => {
    await page.goto('/signup.html');
    await expect(page).toHaveTitle(/sign up|register|join/i);
    await expect(page.getByRole('button', { name: /sign up|create account|register/i }).first()).toBeVisible();
  });

  test('shows validation error for invalid email', async ({ page }) => {
    await page.goto('/signup.html');

    const emailField = page.getByPlaceholder(/email/i).first();
    await emailField.fill('not-an-email');

    const submit = page.getByRole('button', { name: /sign up|create account|register/i }).first();
    await submit.click();

    // Expect either native HTML5 validation or an error message
    const isInvalid = await emailField.evaluate((el) => !el.validity.valid);
    const errorVisible = await page.getByText(/invalid email|valid email|email required/i).isVisible();
    expect(isInvalid || errorVisible).toBeTruthy();
  });

  test('shows validation error for short password', async ({ page }) => {
    await page.goto('/signup.html');

    const emailField = page.getByPlaceholder(/email/i).first();
    const passwordField = page.getByPlaceholder(/password/i).first();
    await emailField.fill(testEmail());
    await passwordField.fill('123');

    const submit = page.getByRole('button', { name: /sign up|create account|register/i }).first();
    await submit.click();

    await page.waitForTimeout(1_000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/password.*short|at least \d|minimum/i);
  });
});

test.describe('Candidate login', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page).toHaveTitle(/log in|sign in|login/i);

    const emailInput = page.getByPlaceholder(/email/i).first();
    await expect(emailInput).toBeVisible();
  });

  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto('/login.html');

    await page.getByPlaceholder(/email/i).first().fill('nonexistent@test-hiretrack.dev');
    await page.getByPlaceholder(/password/i).first().fill('wrongpassword');
    await page.getByRole('button', { name: /log in|sign in|login/i }).first().click();

    // Should show an error message within 5 s, not redirect
    await page.waitForTimeout(3_000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/invalid|incorrect|not found|wrong|error/i);
    expect(page.url()).toMatch(/login/i);
  });
});
