export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    const { destination, otp } = body;
    const WEB3FORMS_KEY = '30483d95-3da0-4a00-a262-944b2e82b3b2';

    if (!destination || !otp) {
      return res.status(200).json({ ok: false, error: 'Missing destination or otp' });
    }

    // Send to employer email using Web3Forms
    // Web3Forms sends to the account email by default
    // We include the OTP and employer email in the message
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: `HireTrack OTP for ${destination}: ${otp}`,
        message: `EMPLOYER OTP REQUEST\n\nSend this OTP to: ${destination}\n\nOTP: ${otp}\n\nValid for 2 minutes.`,
        from_name: 'HireTrack OTP System',
        replyto: destination
      })
    });
    const data = await response.json();

    // Also use EmailJS or similar to send directly to employer
    // For now use Resend free tier
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY || 're_free'}`
      },
      body: JSON.stringify({
        from: 'HireTrack <onboarding@resend.dev>',
        to: [destination],
        subject: `Your HireTrack OTP: ${otp}`,
        html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:2rem;border:1px solid #e2e8f0;border-radius:12px;">
          <h2 style="color:#0f172a;">Your HireTrack OTP</h2>
          <p style="color:#64748b;">Use this OTP to verify your employer account:</p>
          <div style="background:#f0f7ff;border-radius:8px;padding:1.5rem;text-align:center;margin:1.5rem 0;">
            <span style="font-size:2.5rem;font-weight:800;letter-spacing:8px;color:#3b82f6;">${otp}</span>
          </div>
          <p style="color:#64748b;font-size:0.85rem;">⏱ Valid for 2 minutes. Do not share with anyone.</p>
          <p style="color:#94a3b8;font-size:0.75rem;margin-top:1rem;">— HireTrack Team</p>
        </div>`
      })
    });

    if (resendResponse.ok) {
      return res.status(200).json({ ok: true, method: 'resend' });
    } else if (data.success) {
      return res.status(200).json({ ok: true, method: 'web3forms', note: 'OTP sent to admin, please check' });
    } else {
      return res.status(200).json({ ok: false, error: 'Failed to send email' });
    }

  } catch(e) {
    console.error('send-otp error:', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
