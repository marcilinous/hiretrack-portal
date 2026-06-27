/**
 * API rate limiting — verify that endpoints reject excessive requests.
 *
 * These tests call the live API endpoints directly (not via the UI).
 * They verify that the rate-limit headers / 429 responses are working.
 *
 * Set BASE_URL to staging before running to avoid hitting production limits.
 */
import { test, expect } from '@playwright/test';

const OTP_ENDPOINT = '/api/email?action=send-otp';
const AI_ENDPOINT = '/api/ai';

test.describe('OTP rate limiting', () => {
  test('blocks after 5 OTP requests to the same destination', async ({ request, baseURL }) => {
    const destination = `rate-limit-test-${Date.now()}@test-hiretrack.dev`;
    const payload = { destination, otp: '123456' };

    let lastStatus = 200;
    for (let i = 0; i < 7; i++) {
      const res = await request.post(`${baseURL}${OTP_ENDPOINT}`, {
        data: payload,
        headers: { 'Content-Type': 'application/json' },
      });
      lastStatus = res.status();
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });
});

test.describe('AI rate limiting', () => {
  test('returns 429 after exceeding per-IP limit', async ({ request, baseURL }) => {
    // Use a prompt that's extremely cheap (short) but fires the rate-limit counter
    const payload = { prompt: 'hi', mode: 'text' };

    let got429 = false;
    // Send up to 35 requests (limit is 30/hour per IP)
    for (let i = 0; i < 35; i++) {
      const res = await request.post(`${baseURL}${AI_ENDPOINT}`, {
        data: payload,
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.status() === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
