import crypto from 'crypto';

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const EMPLOYER_PLANS_ORDER = {
  starter:    { price: 499 },
  pro:        { price: 999 },
  enterprise: { price: 2499 }
};
const EMPLOYER_PLANS_VERIFY = {
  starter:    { jobs: 3,   days: 30 },
  pro:        { jobs: 8,   days: 60 },
  enterprise: { jobs: 999, days: 90 }
};

export default async function handler(req, res) {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const action = req.query.action || body?.action;

  try {
    switch (action) {
      case 'candidate-order':  return await candidateOrder(req, res, body);
      case 'candidate-verify': return await candidateVerify(req, res, body);
      case 'employer-order':   return await employerOrder(req, res, body);
      case 'employer-verify':  return await employerVerify(req, res, body);
      case 'boost-order':      return await boostOrder(req, res, body);
      case 'boost-verify':     return await boostVerify(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[payments:${action}] error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ── Candidate Pro order (₹49) ──────────────────────────────────────────────
async function candidateOrder(req, res, body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET) return res.status(500).json({ ok: false, error: 'Payment not configured' });

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
    body: JSON.stringify({ amount: 4900, currency: 'INR', receipt: `ht_${Date.now()}`, notes: { product: 'candidate_pro_30d' } })
  });
  const order = await r.json();
  if (!order.id) return res.status(500).json({ ok: false, error: order.error?.description || 'Order creation failed' });
  return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id });
}

// ── Candidate Pro verify ───────────────────────────────────────────────────
async function candidateVerify(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, candidateId } = body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !candidateId) {
    return res.status(400).json({ ok: false, error: 'Missing payment fields' });
  }

  const digest = crypto.createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Candidate Pro signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  const proExpiry = new Date();
  proExpiry.setDate(proExpiry.getDate() + 30);
  const proExpiryISO = proExpiry.toISOString();

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${candidateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ pro_expires_at: proExpiryISO })
  });
  if (!upd.ok) { const err = await upd.text(); console.error('Supabase candidate Pro update failed:', err); return res.status(500).json({ ok: false, error: 'Failed to activate Pro' }); }

  console.log(`Pro activated for candidate ${candidateId} until ${proExpiryISO}`);
  return res.status(200).json({ ok: true, pro_expires_at: proExpiryISO });
}

// ── Employer plan order ────────────────────────────────────────────────────
async function employerOrder(req, res, body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET) return res.status(500).json({ ok: false, error: 'Payment not configured' });

  const { planName } = body || {};
  if (!EMPLOYER_PLANS_ORDER[planName]) return res.status(400).json({ ok: false, error: 'Invalid plan' });

  const subtotal = EMPLOYER_PLANS_ORDER[planName].price;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
    body: JSON.stringify({ amount: total * 100, currency: 'INR', receipt: `ht_emp_${Date.now()}`, notes: { product: `employer_${planName}_30d` } })
  });
  const order = await r.json();
  if (!order.id) return res.status(500).json({ ok: false, error: order.error?.description || 'Order creation failed' });
  return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id });
}

// ── Employer plan verify ───────────────────────────────────────────────────
async function employerVerify(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, employerId, planName } = body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !employerId || !planName) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }
  if (!EMPLOYER_PLANS_VERIFY[planName]) return res.status(400).json({ ok: false, error: 'Invalid plan' });

  const digest = crypto.createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Employer signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  const plan = EMPLOYER_PLANS_VERIFY[planName];
  const planExpiresAt = new Date();
  planExpiresAt.setDate(planExpiresAt.getDate() + 30);
  const planExpiresISO = planExpiresAt.toISOString();

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/employers?id=eq.${employerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ plan: planName, payment_id: razorpay_payment_id, plan_expires_at: planExpiresISO, job_limit: plan.jobs, day_limit: plan.days })
  });
  if (!upd.ok) { const err = await upd.text(); console.error('Supabase employer update failed:', err); return res.status(500).json({ ok: false, error: 'Failed to activate plan' }); }

  console.log(`Plan ${planName} activated for employer ${employerId} until ${planExpiresISO}`);
  return res.status(200).json({ ok: true, plan_expires_at: planExpiresISO, job_limit: plan.jobs, day_limit: plan.days });
}

// ── Profile boost order (₹99) ─────────────────────────────────────────────
async function boostOrder(req, res, body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET) return res.status(500).json({ ok: false, error: 'Payment not configured' });

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
    body: JSON.stringify({ amount: 9900, currency: 'INR', receipt: `boost_${Date.now()}`, notes: { product: 'profile_boost_7d' } })
  });
  const order = await r.json();
  if (!order.id) return res.status(500).json({ ok: false, error: order.error?.description || 'Order creation failed' });
  return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id });
}

// ── Profile boost verify ───────────────────────────────────────────────────
async function boostVerify(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, candidateId } = body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !candidateId) {
    return res.status(400).json({ ok: false, error: 'Missing payment fields' });
  }

  const digest = crypto.createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Boost signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  const boostedUntil = new Date();
  boostedUntil.setDate(boostedUntil.getDate() + 7);
  const boostedUntilISO = boostedUntil.toISOString();

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${candidateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ boosted_until: boostedUntilISO })
  });
  if (!upd.ok) { const err = await upd.text(); console.error('Supabase boost update failed:', err); return res.status(500).json({ ok: false, error: 'Failed to activate boost' }); }

  console.log(`Profile boost activated for candidate ${candidateId} until ${boostedUntilISO}`);
  return res.status(200).json({ ok: true, boosted_until: boostedUntilISO });
}
