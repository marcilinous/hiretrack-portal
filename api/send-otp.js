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
      return res.status(200).json({ ok: false, error: 'Missing destination or otp' });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`
      },
      body: JSON.stringify({
        from: 'HireTrack <onboarding@resend.dev>',
        to: [destination],
        subject: `Your HireTrack OTP: ${otp}`,
        html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:2rem;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
          <h2 style="color:#0f172a;margin-bottom:0.5rem;">Your HireTrack OTP</h2>
          <p style="color:#64748b;margin-bottom:1.5rem;">Use this code to verify your employer account</p>
          <div style="background:#f0f7ff;border-radius:12px;padding:2rem;margin-bottom:1.5rem;">
            <span style="font-size:2.5rem;font-weight:800;letter-spacing:12px;color:#3b82f6;">${otp}</span>
          </div>
          <p style="color:#64748b;font-size:0.85rem;">⏱ Valid for 2 minutes only.</p>
          <p style="color:#64748b;font-size:0.85rem;">🔒 Do not share this with anyone.</p>
          <p style="color:#94a3b8;font-size:0.75rem;margin-top:1.5rem;">— HireTrack Team | hiretrack-portal.vercel.app</p>
        </div>`
      })
    });

    const resendData = await resendResponse.json();
    console.log('Resend response:', JSON.stringify(resendData));

    if (resendResponse.ok && resendData.id) {
      return res.status(200).json({ ok: true });
    } else {
      return res.status(200).json({ ok: false, error: JSON.stringify(resendData) });
    }

  } catch(e) {
    console.error('send-otp error:', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
