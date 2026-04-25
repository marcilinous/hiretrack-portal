export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    // Parse body — handle both string and object
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);

    const { type, destination, otp } = body;
    const FAST2SMS_KEY = process.env.FAST2SMS_KEY;
    const WEB3FORMS_KEY = '30483d95-3da0-4a00-a262-944b2e82b3b2';

    if (!type || !destination || !otp) {
      return res.status(200).json({ ok: false, error: `Missing fields: type=${type}, destination=${destination}, otp=${otp}` });
    }

    if (type === 'sms') {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': FAST2SMS_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: otp,
          numbers: destination,
          flash: 0
        })
      });
      const data = await response.json();
      console.log('Fast2SMS response:', JSON.stringify(data));
      if (data.return === true) {
        return res.status(200).json({ ok: true });
      } else {
        return res.status(200).json({ ok: false, error: JSON.stringify(data) });
      }
    }

    if (type === 'email') {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: `Your HireTrack OTP: ${otp}`,
          message: `Your HireTrack verification OTP is: ${otp}\n\nThis OTP is valid for 2 minutes.\nDo not share this with anyone.\n\n— HireTrack Team`,
          from_name: 'HireTrack',
          email: destination
        })
      });
      const data = await response.json();
      return res.status(200).json({ ok: data.success === true });
    }

    return res.status(200).json({ ok: false, error: `Unknown type: ${type}` });

  } catch(e) {
    console.error('send-otp error:', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
