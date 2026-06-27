/**
 * Shared test helpers for HireTrack E2E suite.
 */

/** Generate a unique email for test isolation. */
export function testEmail(prefix = 'e2e') {
  return `${prefix}+${Date.now()}@test-hiretrack.dev`;
}

/** Wait for a toast / alert text to appear anywhere on the page. */
export async function expectToast(page, textOrRegex) {
  await page.waitForFunction(
    (pattern) => {
      const body = document.body.innerText;
      return typeof pattern === 'string' ? body.includes(pattern) : new RegExp(pattern).test(body);
    },
    textOrRegex instanceof RegExp ? textOrRegex.source : textOrRegex,
    { timeout: 10_000 }
  );
}

/** Fill a visible input identified by placeholder or label text. */
export async function fill(page, label, value) {
  const input = page.getByPlaceholder(label).or(page.getByLabel(label));
  await input.first().fill(value);
}
