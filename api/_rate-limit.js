/**
 * Lightweight in-memory rate limiter for Vercel serverless functions.
 *
 * Each function instance has its own store — this limits bursts within
 * a single cold-start lifetime, which is the realistic attack surface for
 * Vercel's single-tenant execution model. For stricter enforcement, back
 * the store with Upstash Redis or Supabase.
 *
 * Usage:
 *   import { rateLimit } from './_rate-limit.js';
 *   const { ok, retryAfter } = rateLimit('otp', ip, 5, 60);   // 5 req/60s
 *   if (!ok) return res.status(429).json({ ok: false, error: `Rate limit exceeded. Retry in ${retryAfter}s.` });
 */

// Map<`namespace:key` → { count, windowStart }>
const _store = new Map();

/**
 * @param {string} namespace  - logical bucket (e.g. 'otp', 'ai-chat')
 * @param {string} key        - per-caller identifier (email, ip, candidateId)
 * @param {number} maxRequests
 * @param {number} windowSecs - sliding window length in seconds
 * @returns {{ ok: boolean, retryAfter: number }}
 */
export function rateLimit(namespace, key, maxRequests, windowSecs) {
  const storeKey = `${namespace}:${key}`;
  const now = Date.now();
  const windowMs = windowSecs * 1000;

  const entry = _store.get(storeKey);

  if (!entry || now - entry.windowStart >= windowMs) {
    _store.set(storeKey, { count: 1, windowStart: now });
    return { ok: true, retryAfter: 0 };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return { ok: false, retryAfter };
  }

  entry.count += 1;
  return { ok: true, retryAfter: 0 };
}

/**
 * Extract a best-effort client IP from a Vercel/Node request.
 * Falls back to 'unknown' so callers never receive null.
 */
export function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
