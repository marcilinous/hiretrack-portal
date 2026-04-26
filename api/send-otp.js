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

    const RESEND_KEY = process.env.RESEND_API_KEY || 're_Gv372zee_4dn4Rzb1h1G8YPaFEqSkZR55';

    if (!destination || !otp) {
      return res.status(200).json({ ok: false, error: 'Missing fields' });
    }

    const resendBody = {
      from: 'noreply@hiretrack.co.in',
      to: [destination],
      subject: `Your HireTrack OTP: ${otp}`,
      html: `<div style="font-family:sans-serif;padding:2rem;text-align:center;">
        <h2>Your HireTrack OTP</h2>
        <div style="background:#f0f7ff;border-radius:12px;padding:2rem;margin:1rem 0;">
          <span style="font-size:2.5rem;font-weight:800;letter-spacing:12px;color:#3b82f6;">${otp}</span>
        </div>
        <p>Valid for 2 minutes. Do not share.</p>
        <p style="color:#94a3b8;font-size:0.75rem;">— HireTrack Team</p>
      </div>`
    };

    console.log('Sending to:', destination, 'with key:', RESEND_KEY.slice(0,10)+'...');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`
      },
      body: JSON.stringify(resendBody)
    });

    const resendText = await resendResponse.text();
    console.log('Resend status:', resendResponse.status, 'body:', resendText);

    let resendData;
    try { resendData = JSON.parse(resendText); } catch(e) { resendData = { error: resendText }; }

    if (resendResponse.ok && resendData.id) {
      return res.status(200).json({ ok: true });
    } else {
      // If Resend fails, return the actual error
      return res.status(200).json({ ok: false, error: resendData.message || resendData.error || resendText });
    }

  } catch(e) {
    console.error('send-otp error:', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
