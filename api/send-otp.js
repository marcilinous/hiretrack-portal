export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, destination, otp } = req.body;
  const FAST2SMS_KEY = process.env.FAST2SMS_KEY;
  const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY || '30483d95-3da0-4a00-a262-944b2e82b3b2';

  try {
    if (type === 'sms') {
      // Send SMS OTP via Fast2SMS
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
      if (data.return === true) {
        return res.status(200).json({ ok: true });
      } else {
        return res.status(200).json({ ok: false, error: data.message });
      }
    }

    if (type === 'email') {
      // Send Email OTP via Web3Forms
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: `Your HireTrack OTP: ${otp}`,
          message: `Your HireTrack verification OTP is: ${otp}\n\nThis OTP is valid for 2 minutes.\n\nDo not share this with anyone.\n\n— HireTrack Team`,
          from_name: 'HireTrack',
          email: destination
        })
      });
      const data = await response.json();
      return res.status(200).json({ ok: data.success });
    }

    return res.status(400).json({ error: 'Invalid type' });

  } catch(e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
