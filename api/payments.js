import crypto from 'crypto';

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const EMPLOYER_PLANS_ORDER = {
  basic: { price: 499 },
  growth: { price: 999 },
  pro: { price: 2499 },
};
const EMPLOYER_PLANS_VERIFY = {
  basic: { jobs: 1, days: 30 },
  growth: { jobs: 3, days: 30 },
  pro: { jobs: 6, days: 30 },
};
const ADDON_PRICE = 199; // ₹ per add-on job post

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
      case 'candidate-order':
        return await candidateOrder(req, res, body);
      case 'candidate-verify':
        return await candidateVerify(req, res, body);
      case 'employer-order':
        return await employerOrder(req, res, body);
      case 'employer-verify':
        return await employerVerify(req, res, body);
      case 'addon-order':
        return await addonOrder(req, res, body);
      case 'addon-verify':
        return await addonVerify(req, res, body);
      case 'boost-order':
        return await boostOrder(req, res, body);
      case 'boost-verify':
        return await boostVerify(req, res, body);
      case 'paylink-info':
        return await paylinkInfo(req, res, body);
      case 'paylink-order':
        return await paylinkOrder(req, res, body);
      case 'paylink-verify':
        return await paylinkVerify(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[payments:${action}] error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ── Candidate Pro order (₹49) ──────────────────────────────────────────────
async function candidateOrder(req, res, _body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET)
    return res.status(500).json({ ok: false, error: 'Payment not configured' });

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: 4900,
      currency: 'INR',
      receipt: `ht_${Date.now()}`,
      notes: { product: 'candidate_pro_30d' },
    }),
  });
  const order = await r.json();
  if (!order.id)
    return res
      .status(500)
      .json({ ok: false, error: order.error?.description || 'Order creation failed' });
  return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id });
}

// ── Candidate Pro verify ───────────────────────────────────────────────────
async function candidateVerify(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, candidateId } = body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !candidateId) {
    return res.status(400).json({ ok: false, error: 'Missing payment fields' });
  }

  const digest = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Candidate Pro signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  const proExpiry = new Date();
  proExpiry.setDate(proExpiry.getDate() + 30);
  const proExpiryISO = proExpiry.toISOString();

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${candidateId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ pro_expires_at: proExpiryISO }),
  });
  if (!upd.ok) {
    const err = await upd.text();
    console.error('Supabase candidate Pro update failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to activate Pro' });
  }

  console.log(`Pro activated for candidate ${candidateId} until ${proExpiryISO}`);
  return res.status(200).json({ ok: true, pro_expires_at: proExpiryISO });
}

// ── Employer plan order ────────────────────────────────────────────────────
async function employerOrder(req, res, body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET)
    return res.status(500).json({ ok: false, error: 'Payment not configured' });

  const { planName } = body || {};
  if (!EMPLOYER_PLANS_ORDER[planName])
    return res.status(400).json({ ok: false, error: 'Invalid plan' });

  const subtotal = EMPLOYER_PLANS_ORDER[planName].price;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: total * 100,
      currency: 'INR',
      receipt: `ht_emp_${Date.now()}`,
      notes: { product: `employer_${planName}_30d` },
    }),
  });
  const order = await r.json();
  if (!order.id)
    return res
      .status(500)
      .json({ ok: false, error: order.error?.description || 'Order creation failed' });
  return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id });
}

// ── Employer plan verify ───────────────────────────────────────────────────
async function employerVerify(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, employerId, planName } =
    body || {};
  if (
    !razorpay_payment_id ||
    !razorpay_order_id ||
    !razorpay_signature ||
    !employerId ||
    !planName
  ) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }
  if (!EMPLOYER_PLANS_VERIFY[planName])
    return res.status(400).json({ ok: false, error: 'Invalid plan' });

  const digest = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Employer signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  const plan = EMPLOYER_PLANS_VERIFY[planName];
  const now = new Date();
  const planExpiresAt = new Date(now);
  planExpiresAt.setDate(planExpiresAt.getDate() + plan.days);
  const planExpiresISO = planExpiresAt.toISOString();

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/employers?id=eq.${employerId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      plan: planName,
      payment_id: razorpay_payment_id,
      plan_start: now.toISOString(),
      plan_expires_at: planExpiresISO,
      job_limit: plan.jobs,
      day_limit: plan.days,
      is_free_trial: false,
    }),
  });
  if (!upd.ok) {
    const err = await upd.text();
    console.error('Supabase employer update failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to activate plan' });
  }

  // Record the payment (best-effort; the plan is already active above).
  await fetch(`${SUPABASE_URL}/rest/v1/employer_payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      employer_id: employerId,
      razorpay_order_id,
      razorpay_payment_id,
      plan: planName,
      amount: EMPLOYER_PLANS_ORDER[planName]?.price || null,
      is_addon: false,
      status: 'success',
    }),
  }).catch(() => {});

  console.log(`Plan ${planName} activated for employer ${employerId} until ${planExpiresISO}`);
  return res.status(200).json({
    ok: true,
    plan_expires_at: planExpiresISO,
    job_limit: plan.jobs,
    day_limit: plan.days,
  });
}

// ── Add-on job post order (₹199 + GST) ─────────────────────────────────────
async function addonOrder(req, res, _body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET)
    return res.status(500).json({ ok: false, error: 'Payment not configured' });

  const subtotal = ADDON_PRICE;
  const total = subtotal + Math.round(subtotal * 0.18);

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: total * 100,
      currency: 'INR',
      receipt: `ht_addon_${Date.now()}`,
      notes: { product: 'employer_addon_post' },
    }),
  });
  const order = await r.json();
  if (!order.id)
    return res
      .status(500)
      .json({ ok: false, error: order.error?.description || 'Order creation failed' });
  return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id });
}

// ── Add-on job post verify — requires an active paid plan ──────────────────
async function addonVerify(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, employerId } = body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !employerId) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  const digest = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Add-on signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  // Add-ons are only valid on top of an active paid plan.
  const emp = await sbGetOne(
    `employers?select=plan,plan_expires_at&id=eq.${employerId}&limit=1`,
    SERVICE_KEY
  );
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });
  const paidActive =
    ['basic', 'growth', 'pro'].includes(emp.plan) &&
    emp.plan_expires_at &&
    new Date(emp.plan_expires_at) > new Date();
  if (!paidActive) {
    return res
      .status(400)
      .json({ ok: false, error: 'Add-on posts require an active Basic, Growth or Pro plan.' });
  }

  await sbPost(
    'addon_posts',
    {
      employer_id: employerId,
      payment_id: razorpay_payment_id,
      amount: ADDON_PRICE,
      valid_until: emp.plan_expires_at,
      is_used: false,
    },
    SERVICE_KEY
  );
  await sbPost(
    'employer_payments',
    {
      employer_id: employerId,
      razorpay_order_id,
      razorpay_payment_id,
      plan: emp.plan,
      amount: ADDON_PRICE,
      is_addon: true,
      status: 'success',
    },
    SERVICE_KEY
  ).catch(() => {});

  console.log(`Add-on post purchased for employer ${employerId} (${razorpay_payment_id})`);
  return res.status(200).json({ ok: true, valid_until: emp.plan_expires_at });
}

// ── Executive payment links (slug = unguessable capability) ────────────────
function svcHeaders(key, extra) {
  return Object.assign(
    { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    extra || {}
  );
}
async function sbGetOne(path, key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svcHeaders(key) });
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d[0] || null : d || null;
}
async function sbPatch(path, body, key) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: svcHeaders(key, { Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
}
async function sbPost(path, body, key) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: svcHeaders(key, { Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
}

async function paylinkInfo(req, res, body) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Server not configured' });
  const slug = (body?.slug || '').trim();
  if (!slug) return res.status(400).json({ ok: false, error: 'Missing link' });
  const link = await sbGetOne(
    `payment_links?select=amount,validity_days,is_paid,referral_id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    SERVICE_KEY
  );
  if (!link) return res.status(404).json({ ok: false, error: 'Payment link not found.' });
  let company = '';
  if (link.referral_id) {
    const ref = await sbGetOne(
      `employer_referrals?select=company,name&id=eq.${link.referral_id}&limit=1`,
      SERVICE_KEY
    );
    company = ref ? ref.company || ref.name || '' : '';
  }
  return res.status(200).json({
    ok: true,
    amount: link.amount,
    validity_days: link.validity_days,
    is_paid: link.is_paid,
    company,
  });
}

async function paylinkOrder(req, res, body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_ID || !KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Payment not configured' });
  const slug = (body?.slug || '').trim();
  const link = await sbGetOne(
    `payment_links?select=id,amount,is_paid&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    SERVICE_KEY
  );
  if (!link) return res.status(404).json({ ok: false, error: 'Payment link not found.' });
  if (link.is_paid)
    return res.status(400).json({ ok: false, error: 'This link has already been paid.' });
  const amountPaise = Math.round(Number(link.amount) * 100);
  if (!(amountPaise > 0)) return res.status(400).json({ ok: false, error: 'Invalid amount.' });

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: `ht_pl_${Date.now()}`,
      notes: { product: 'exec_payment_link', slug },
    }),
  });
  const order = await r.json();
  if (!order.id)
    return res
      .status(500)
      .json({ ok: false, error: order.error?.description || 'Order creation failed' });
  return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id, amount: amountPaise });
}

async function paylinkVerify(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  const { slug, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body || {};
  if (!slug || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature)
    return res.status(400).json({ ok: false, error: 'Missing payment fields' });

  const digest = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Paylink signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  const link = await sbGetOne(
    `payment_links?select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    SERVICE_KEY
  );
  if (!link) return res.status(404).json({ ok: false, error: 'Payment link not found.' });
  if (link.is_paid) return res.status(200).json({ ok: true, alreadyPaid: true });

  const days = Number(link.validity_days) || 30;
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);

  if (link.referral_id) {
    const ref = await sbGetOne(
      `employer_referrals?select=company,name,executive_id&id=eq.${link.referral_id}&limit=1`,
      SERVICE_KEY
    );
    await sbPatch(
      `employer_referrals?id=eq.${link.referral_id}`,
      {
        is_paid: true,
        status: 'plan_active',
        plan_start: start.toISOString(),
        plan_end: end.toISOString(),
        validity_days: days,
      },
      SERVICE_KEY
    );
    if (ref && ref.executive_id) {
      const remind = new Date(end);
      remind.setDate(remind.getDate() - 2);
      const who = ref.company || ref.name || 'employer';
      await sbPost(
        'executive_reminders',
        {
          executive_id: ref.executive_id,
          type: 'plan_expiry',
          message: `Follow up with ${who} — plan expires in 2 days`,
          due_date: remind.toISOString(),
          related_id: link.referral_id,
        },
        SERVICE_KEY
      ).catch(() => {});
    }
  }
  await sbPatch(
    `payment_links?id=eq.${link.id}`,
    { is_paid: true, paid_at: new Date().toISOString() },
    SERVICE_KEY
  );
  console.log(`Payment link ${slug} paid (${razorpay_payment_id})`);
  return res.status(200).json({ ok: true, plan_end: end.toISOString() });
}

// ── Profile boost order (₹99) ─────────────────────────────────────────────
async function boostOrder(req, res, _body) {
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET)
    return res.status(500).json({ ok: false, error: 'Payment not configured' });

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: 9900,
      currency: 'INR',
      receipt: `boost_${Date.now()}`,
      notes: { product: 'profile_boost_7d' },
    }),
  });
  const order = await r.json();
  if (!order.id)
    return res
      .status(500)
      .json({ ok: false, error: order.error?.description || 'Order creation failed' });
  return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id });
}

// ── Profile boost verify ───────────────────────────────────────────────────
async function boostVerify(req, res, body) {
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, candidateId } = body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !candidateId) {
    return res.status(400).json({ ok: false, error: 'Missing payment fields' });
  }

  const digest = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (digest !== razorpay_signature) {
    console.error('Boost signature mismatch', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  const boostedUntil = new Date();
  boostedUntil.setDate(boostedUntil.getDate() + 7);
  const boostedUntilISO = boostedUntil.toISOString();

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${candidateId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ boosted_until: boostedUntilISO }),
  });
  if (!upd.ok) {
    const err = await upd.text();
    console.error('Supabase boost update failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to activate boost' });
  }

  console.log(`Profile boost activated for candidate ${candidateId} until ${boostedUntilISO}`);
  return res.status(200).json({ ok: true, boosted_until: boostedUntilISO });
}
