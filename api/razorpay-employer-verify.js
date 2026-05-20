import crypto from 'crypto';

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const PLANS = {
  starter:    { jobs: 3,   days: 30 },
  pro:        { jobs: 8,   days: 60 },
  enterprise: { jobs: 999, days: 90 }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY_SECRET || !SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Server not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, employerId, planName } = body || {};

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !employerId || !planName) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }
  if (!PLANS[planName]) return res.status(400).json({ ok: false, error: 'Invalid plan' });

  // Verify Razorpay signature
  const digest = crypto.createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (digest !== razorpay_signature) {
    console.error('Signature mismatch for payment', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  const plan = PLANS[planName];
  const planExpiresAt = new Date();
  planExpiresAt.setDate(planExpiresAt.getDate() + 30);
  const planExpiresISO = planExpiresAt.toISOString();

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/employers?id=eq.${employerId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      plan: planName,
      payment_id: razorpay_payment_id,
      plan_expires_at: planExpiresISO,
      job_limit: plan.jobs,
      day_limit: plan.days
    })
  });

  if (!upd.ok) {
    const err = await upd.text();
    console.error('Supabase employer update failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to activate plan' });
  }

  console.log(`Plan ${planName} activated for employer ${employerId} until ${planExpiresISO}`);
  return res.status(200).json({ ok: true, plan_expires_at: planExpiresISO, job_limit: plan.jobs, day_limit: plan.days });
}
