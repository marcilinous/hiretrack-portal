import crypto from 'crypto';

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

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
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, candidateId } = body || {};

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !candidateId) {
    return res.status(400).json({ ok: false, error: 'Missing payment fields' });
  }

  const digest = crypto.createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (digest !== razorpay_signature) {
    console.error('Boost signature mismatch for payment', razorpay_payment_id);
    return res.status(400).json({ ok: false, error: 'Payment verification failed' });
  }

  // Set boosted_until = now + 7 days
  const boostedUntil = new Date();
  boostedUntil.setDate(boostedUntil.getDate() + 7);
  const boostedUntilISO = boostedUntil.toISOString();

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${candidateId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ boosted_until: boostedUntilISO })
  });

  if (!upd.ok) {
    const err = await upd.text();
    console.error('Supabase boost update failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to activate boost' });
  }

  console.log(`Profile boost activated for candidate ${candidateId} until ${boostedUntilISO}`);
  return res.status(200).json({ ok: true, boosted_until: boostedUntilISO });
}
