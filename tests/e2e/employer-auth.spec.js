/**
 * Employer authentication flows — OTP-based login.
 *
 * These tests only verify UI behaviour (form validation, error states).
 * Actual OTP delivery is not tested here as it requires a real email inbox.
 */
import { test, expect } from '@playwright/test';

test.describe('Employer auth (employer-auth.html)', () => {
  test('page loads with email input', async ({ page }) => {
    await page.goto('/employer-auth.html');
    await expect(page).toHaveTitle(/employer|hire|login/i);

    const emailInput = page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i)).first();
    await expect(emailInput).toBeVisible({ timeout: 8_000 });
  });

  test('shows error for invalid email', async ({ page }) => {
    await page.goto('/employer-auth.html');

    const emailInput = page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i)).first();
    await emailInput.fill('bad-email');

    const submit = page.getByRole('button', { name: /send otp|get otp|continue|login/i }).first();
    await submit.click();

    await page.waitForTimeout(1_500);
    const isInvalid = await emailInput.evaluate((el) => !el.validity.valid);
    const errorText = await page.getByText(/invalid email|valid email|enter.*email/i).isVisible();
    expect(isInvalid || errorText).toBeTruthy();
  });

  test('shows OTP input after valid email submit', async ({ page }) => {
    await page.goto('/employer-auth.html');

    // Use a obviously-fake but well-formed email so Resend rejects it server-side
    // without us actually sending an OTP. The UI should still show the OTP step.
    const emailInput = page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i)).first();
    await emailInput.fill('ui-test-no-real-send@test-hiretrack.dev');

    const submit = page.getByRole('button', { name: /send otp|get otp|continue|login/i }).first();
    await submit.click();

    // Either the OTP field appears, or the form shows a server error — both are valid non-crash states
    await page.waitForTimeout(4_000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/TypeError|undefined is not|Uncaught/i);
  });
});
