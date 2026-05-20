import https from 'https';

// Per-instance daily rate limiter for interview prep (3 sessions/day per candidate)
const _prepMap = new Map();
function _checkPrepLimit(candidateId) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${candidateId}:${today}`;
  const count = _prepMap.get(key) || 0;
  if (count >= 3) return false;
  _prepMap.set(key, count + 1);
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    const { prompt, mode, context, candidateId } = body || {};

    if (context === 'interview_prep' && candidateId) {
      if (!_checkPrepLimit(candidateId)) {
        return res.status(429).json({ error: 'daily_limit_reached' });
      }
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(200).json({ answer: 'API key not configured.' });
    if (!prompt) return res.status(200).json({ answer: 'No prompt provided.' });

    const isJsonMode = mode === 'json';

    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: isJsonMode
            ? 'You are a JSON generator. Return ONLY valid JSON arrays with no explanation, no markdown, no extra text.'
            : "You are a career assistant for HireTrack, India's growing job portal. Give practical, actionable advice in 3-4 sentences for the Indian job market across all industries and cities."
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: isJsonMode ? 2000 : 300,
      temperature: isJsonMode ? 0.3 : 0.7
    });

    const answer = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const reqGroq = https.request(options, (groqRes) => {
        let data = '';
        groqRes.on('data', chunk => data += chunk);
        groqRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              console.error('Groq API error:', parsed.error);
              resolve('AI service error: ' + (parsed.error.message || 'Unknown'));
            } else {
              resolve(parsed.choices?.[0]?.message?.content || 'No response received.');
            }
          } catch(e) {
            console.error('Parse error, raw:', data.slice(0, 200));
            resolve('Failed to parse AI response.');
          }
        });
      });

      reqGroq.on('error', (e) => { console.error('Request error:', e.message); reject(e); });
      reqGroq.write(payload);
      reqGroq.end();
    });

    return res.status(200).json({ answer });

  } catch(e) {
    console.error('ai.js catch:', e.message);
    return res.status(200).json({ answer: 'Something went wrong. Please try again.' });
  }
}
