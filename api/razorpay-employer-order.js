const PLANS = {
  starter:    { price: 499 },
  pro:        { price: 999 },
  enterprise: { price: 2499 }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET) return res.status(500).json({ ok: false, error: 'Payment not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { planName } = body || {};

  if (!PLANS[planName]) return res.status(400).json({ ok: false, error: 'Invalid plan' });

  const subtotal = PLANS[planName].price;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  try {
    const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body: JSON.stringify({
        amount: total * 100,
        currency: 'INR',
        receipt: `ht_emp_${Date.now()}`,
        notes: { product: `employer_${planName}_30d` }
      })
    });
    const order = await r.json();
    if (!order.id) return res.status(500).json({ ok: false, error: order.error?.description || 'Order creation failed' });
    return res.status(200).json({ ok: true, key: KEY_ID, orderId: order.id });
  } catch(e) {
    console.error('razorpay-employer-order error:', e.message);
    return res.status(500).json({ ok: false, error: 'Order creation failed' });
  }
}
