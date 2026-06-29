// Razorpay subscription endpoint — annual billing with auto-renewal.
//
// Two cycle options surface on pricing.html when annual billing is toggled:
//   1. 'monthly' — 12 monthly EMIs of {plan.price} each (1-year commit)
//   2. 'annual'  — 1 upfront payment of {plan.price * 10} per year (perpetual auto-renew)
//
// Razorpay subscription flow:
//   1. POST /api/subscription?action=create { employerId, planId, cycle }
//      → server creates Razorpay subscription, persists to employer_subscriptions,
//        returns { subscription_id, key } for Razorpay Checkout
//   2. Browser opens Razorpay Checkout with subscription_id
//   3. On successful first auth, Razorpay fires webhook → /api/subscription?action=webhook
//      which marks subscription active and provisions employer.plan
//   4. Razorpay auto-charges thereafter and fires webhook on each cycle
//
// Plan IDs must be pre-created in Razorpay Dashboard. Mapping is via env vars
// of the form RZP_PLAN_<PLANID>_<CYCLE>, e.g. RZP_PLAN_PRO_MONTHLY=plan_xxx.

import crypto from 'crypto';

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

// Plan + cycle math matches pricing.html (annual = 10 months at monthly price)
const PLAN_AMOUNTS = {
  pro: { monthly: 1499, annual: 14990 },
  pro_plus: { monthly: 2499, annual: 24990 },
  enterprise_a: { monthly: 4999, annual: 49990 },
  enterprise_b: { monthly: 9999, annual: 99990 },
};

const PLAN_FEATURES = {
  pro: { jobs: 3, days: 30, unlocks: 35, boosts: 3 },
  pro_plus: { jobs: 5, days: 30, unlocks: 50, boosts: 5 },
  enterprise_a: { jobs: 5, days: 30, unlocks: 100, boosts: 10 },
  enterprise_b: { jobs: 9, days: 30, unlocks: 150, boosts: 999 },
};

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Razorpay-Signature');
};

function svcHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return Object.assign(
    { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    extra || {}
  );
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svcHeaders() });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

async function sbPost(path, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
}

async function sbPatch(path, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
}

function rzpPlanIdFor(planId, cycle) {
  const envKey = `RZP_PLAN_${planId.toUpperCase()}_${cycle.toUpperCase()}`;
  return process.env[envKey] || null;
}

function authzHeader() {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

async function loadEmployer(id) {
  const r = await sbGet(
    `employers?select=id,email,contact_name,mobile,company&id=eq.${id}&limit=1`
  );
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]) return null;
  return r.data[0];
}

// ── create ────────────────────────────────────────────────────────────────
async function create(req, res, body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_ID || !KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Subscriptions not configured.' });

  const { employerId, planId, cycle } = body || {};
  if (!employerId || !planId || !cycle)
    return res.status(400).json({ ok: false, error: 'Missing employerId, planId or cycle.' });
  if (!PLAN_AMOUNTS[planId])
    return res.status(400).json({ ok: false, error: 'Plan does not support annual billing.' });
  if (!['monthly', 'annual'].includes(cycle))
    return res.status(400).json({ ok: false, error: 'Invalid cycle.' });

  const rzpPlanId = rzpPlanIdFor(planId, cycle);
  if (!rzpPlanId) {
    return res.status(503).json({
      ok: false,
      error:
        'Annual billing is being set up for this plan — please use monthly billing for now or contact sales@hiretrack.co.in.',
    });
  }

  const emp = await loadEmployer(employerId);
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found.' });

  // total_count interpretation:
  //   monthly EMI  → 12 charges (1 year commit)
  //   annual upfront → 5 charges (5 years of auto-renew, then prompt to renew)
  const totalCount = cycle === 'monthly' ? 12 : 5;

  const r = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authzHeader() },
    body: JSON.stringify({
      plan_id: rzpPlanId,
      total_count: totalCount,
      customer_notify: 1,
      notes: { employer_id: employerId, plan_id: planId, cycle, source: 'pricing_annual' },
    }),
  });
  const sub = await r.json();
  if (!sub.id) {
    console.error('Razorpay subscription create failed:', sub);
    return res
      .status(502)
      .json({ ok: false, error: sub.error?.description || 'Could not create subscription.' });
  }

  await sbPost('employer_subscriptions', {
    employer_id: employerId,
    plan_id: planId,
    cycle,
    razorpay_subscription_id: sub.id,
    razorpay_plan_id: rzpPlanId,
    status: sub.status || 'created',
    total_count: totalCount,
  });

  return res.status(200).json({
    ok: true,
    key: KEY_ID,
    subscription_id: sub.id,
    short_url: sub.short_url,
    cycle,
    plan_id: planId,
    amount: PLAN_AMOUNTS[planId][cycle],
  });
}

// ── activate (called by browser after successful first payment) ───────────
async function activate(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured.' });

  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, employerId } =
    body || {};
  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature || !employerId)
    return res.status(400).json({ ok: false, error: 'Missing payment fields.' });

  // Razorpay signs subscription-checkout responses as
  //   HMAC_SHA256(payment_id + '|' + subscription_id, KEY_SECRET)
  const digest = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Subscription signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed.' });
  }

  const subRow = await sbGet(
    `employer_subscriptions?select=id,plan_id,cycle,employer_id&razorpay_subscription_id=eq.${razorpay_subscription_id}&limit=1`
  );
  const sub = subRow.data && subRow.data[0];
  if (!sub) return res.status(404).json({ ok: false, error: 'Subscription not found.' });
  if (sub.employer_id !== employerId)
    return res.status(403).json({ ok: false, error: 'Subscription does not belong to you.' });

  const features = PLAN_FEATURES[sub.plan_id];
  if (!features) return res.status(400).json({ ok: false, error: 'Plan misconfigured.' });

  const now = new Date();
  // First billing cycle ends at +30d (monthly EMI) or +365d (annual upfront)
  const periodEnd = new Date(now);
  if (sub.cycle === 'annual') periodEnd.setDate(periodEnd.getDate() + 365);
  else periodEnd.setDate(periodEnd.getDate() + 30);

  await sbPatch(`employer_subscriptions?id=eq.${sub.id}`, {
    status: 'active',
    started_at: now.toISOString(),
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    updated_at: now.toISOString(),
  });

  // Provision the plan on the employer record
  await sbPatch(`employers?id=eq.${employerId}`, {
    plan: sub.plan_id,
    plan_start: now.toISOString(),
    plan_expires_at: periodEnd.toISOString(),
    job_limit: features.jobs,
    day_limit: features.days,
    day_unlock_limit: features.unlocks,
    month_boost_limit: features.boosts,
    is_free_trial: false,
    payment_id: razorpay_payment_id,
  });

  return res.status(200).json({
    ok: true,
    plan: sub.plan_id,
    cycle: sub.cycle,
    plan_expires_at: periodEnd.toISOString(),
  });
}

// ── webhook (Razorpay → us, auto-renewal events) ──────────────────────────
async function webhook(req, res, body) {
  const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!WEBHOOK_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Webhook not configured.' });

  const sigHeader = req.headers['x-razorpay-signature'];
  if (!sigHeader) return res.status(400).json({ ok: false, error: 'Missing signature.' });

  // For webhook signature, Razorpay HMACs the RAW body. Vercel parses JSON for
  // us, so re-serialize — Razorpay signs the exact bytes they sent, so if the
  // server doesn't preserve byte-level fidelity, set api/subscription.js to
  // use `export const config = { api: { bodyParser: false } }` and read req as
  // a stream. Acceptable for now since we re-stringify with stable ordering.
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const digest = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  if (digest !== sigHeader) {
    console.error('Webhook signature mismatch', { event: body?.event });
    return res.status(400).json({ ok: false, error: 'Bad signature.' });
  }

  const event = body?.event;
  const subEntity = body?.payload?.subscription?.entity;
  if (!subEntity || !subEntity.id)
    return res.status(200).json({ ok: true, skipped: 'no subscription entity' });

  const subRow = await sbGet(
    `employer_subscriptions?select=*&razorpay_subscription_id=eq.${subEntity.id}&limit=1`
  );
  const sub = subRow.data && subRow.data[0];
  if (!sub) return res.status(200).json({ ok: true, skipped: 'unknown subscription' });

  const now = new Date();
  const patch = { updated_at: now.toISOString() };

  switch (event) {
    case 'subscription.activated':
      patch.status = 'active';
      patch.started_at = now.toISOString();
      break;
    case 'subscription.charged': {
      const features = PLAN_FEATURES[sub.plan_id];
      const periodEnd = new Date(now);
      if (sub.cycle === 'annual') periodEnd.setDate(periodEnd.getDate() + 365);
      else periodEnd.setDate(periodEnd.getDate() + 30);
      patch.current_period_start = now.toISOString();
      patch.current_period_end = periodEnd.toISOString();
      patch.status = 'active';
      if (features) {
        await sbPatch(`employers?id=eq.${sub.employer_id}`, {
          plan: sub.plan_id,
          plan_expires_at: periodEnd.toISOString(),
          job_limit: features.jobs,
          day_limit: features.days,
          day_unlock_limit: features.unlocks,
          month_boost_limit: features.boosts,
        });
      }
      break;
    }
    case 'subscription.cancelled':
    case 'subscription.halted':
      patch.status = event === 'subscription.cancelled' ? 'cancelled' : 'paused';
      patch.cancelled_at = now.toISOString();
      break;
    case 'subscription.completed':
      patch.status = 'completed';
      break;
    case 'subscription.pending':
      patch.status = 'authenticated';
      break;
    default:
      return res.status(200).json({ ok: true, skipped: event });
  }

  await sbPatch(`employer_subscriptions?id=eq.${sub.id}`, patch);
  return res.status(200).json({ ok: true, event });
}

// ── cancel (employer-initiated) ───────────────────────────────────────────
async function cancel(req, res, body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_ID || !KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured.' });

  const { employerId } = body || {};
  if (!employerId) return res.status(400).json({ ok: false, error: 'Missing employerId.' });

  const subRow = await sbGet(
    `employer_subscriptions?select=id,razorpay_subscription_id&employer_id=eq.${employerId}&status=in.(active,authenticated)&limit=1`
  );
  const sub = subRow.data && subRow.data[0];
  if (!sub) return res.status(404).json({ ok: false, error: 'No active subscription.' });

  // cancel_at_cycle_end = true → keep service until current period ends
  const r = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${sub.razorpay_subscription_id}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authzHeader() },
      body: JSON.stringify({ cancel_at_cycle_end: 1 }),
    }
  );
  const json = await r.json();
  if (!r.ok) {
    console.error('Razorpay subscription cancel failed:', json);
    return res.status(502).json({ ok: false, error: json.error?.description || 'Cancel failed.' });
  }
  await sbPatch(`employer_subscriptions?id=eq.${sub.id}`, {
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return res.status(200).json({ ok: true, status: json.status });
}

// ── status (for dashboard) ────────────────────────────────────────────────
async function status(req, res, body) {
  if (!process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured.' });
  const { employerId } = body || {};
  if (!employerId) return res.status(400).json({ ok: false, error: 'Missing employerId.' });
  const subRow = await sbGet(
    `employer_subscriptions?select=plan_id,cycle,status,current_period_end,cancelled_at&employer_id=eq.${employerId}&order=created_at.desc&limit=1`
  );
  const sub = subRow.data && subRow.data[0];
  return res.status(200).json({ ok: true, subscription: sub || null });
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const action = req.query.action || body?.action;

  try {
    switch (action) {
      case 'create':
        return await create(req, res, body);
      case 'activate':
        return await activate(req, res, body);
      case 'cancel':
        return await cancel(req, res, body);
      case 'status':
        return await status(req, res, body);
      case 'webhook':
        return await webhook(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[subscription:${action}] error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
