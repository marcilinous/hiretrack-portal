import https from 'https';
import { rateLimit, clientIp } from './_rate-limit.js';

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
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    const { prompt, mode, context, candidateId, action, resumeText } = body || {};

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(200).json({ answer: 'API key not configured.' });

    // Global IP-based rate limit: 30 AI calls/hour per client
    const ip = clientIp(req);
    const ipLimit = rateLimit('ai-ip', ip, 30, 3600);
    if (!ipLimit.ok) {
      return res.status(429).json({
        answer: `AI rate limit reached. Retry in ${ipLimit.retryAfter}s.`,
        error: 'rate_limited',
      });
    }

    // Resume parsing: 10/hour per IP (more expensive calls)
    if (action === 'parse-resume') {
      const parseLimit = rateLimit('ai-parse', ip, 10, 3600);
      if (!parseLimit.ok) {
        return res.status(429).json({
          ok: false,
          error: `Resume parsing limit reached. Retry in ${parseLimit.retryAfter}s.`,
        });
      }
    }

    // ── Resume parsing ──
    if (action === 'parse-resume') {
      if (!resumeText || resumeText.trim().length < 50) {
        return res.status(400).json({ ok: false, error: 'Resume text too short to parse.' });
      }
      const truncated = resumeText.slice(0, 6000); // stay within token limits
      const parsePrompt = `Extract information from the following resume and return ONLY a valid JSON object with these exact keys (use null for anything not found):
{
  "name": "Full name",
  "jobtitle": "Current or most recent job title",
  "current_company": "Current or most recent employer",
  "experience": "Total years of experience as a short string e.g. '3 years' or '5+ years'",
  "city": "City they are based in",
  "skills": ["array", "of", "up to 12 technical or professional skills"],
  "about": "2-3 sentence professional summary written in first person",
  "notice_period": "Notice period if mentioned e.g. '30 days' or '1 month', else null",
  "expected_salary": "Expected or current salary/CTC if mentioned, else null"
}

Resume text:
${truncated}`;

      const parsed = await callGroq(GROQ_API_KEY, parsePrompt, 'object', 1000);
      try {
        // Strip markdown fences if present
        const clean = parsed.replace(/```json|```/g, '').trim();
        const data = JSON.parse(clean);
        // Ensure skills is always an array
        if (data.skills && !Array.isArray(data.skills)) {
          data.skills = String(data.skills)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return res.status(200).json({ ok: true, data });
      } catch {
        return res.status(200).json({ ok: false, error: 'Could not parse AI response.' });
      }
    }

    // ── Interview prep (existing flow) ──
    if (context === 'interview_prep' && candidateId) {
      if (!_checkPrepLimit(candidateId)) {
        return res.status(429).json({ error: 'daily_limit_reached' });
      }
    }

    if (!prompt) return res.status(200).json({ answer: 'No prompt provided.' });

    const isJsonMode = mode === 'json';

    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: isJsonMode
            ? 'You are a JSON generator. Return ONLY valid JSON arrays with no explanation, no markdown, no extra text.'
            : "You are a career assistant for HireTrack, India's growing job portal. Give practical, actionable advice in 3-4 sentences for the Indian job market across all industries and cities.",
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: isJsonMode ? 2000 : 300,
      temperature: isJsonMode ? 0.3 : 0.7,
    });

    const answer = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const reqGroq = https.request(options, (groqRes) => {
        let data = '';
        groqRes.on('data', (chunk) => (data += chunk));
        groqRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              console.error('Groq API error:', parsed.error);
              resolve('AI service error: ' + (parsed.error.message || 'Unknown'));
            } else {
              resolve(parsed.choices?.[0]?.message?.content || 'No response received.');
            }
          } catch (e) {
            console.error('Parse error, raw:', data.slice(0, 200));
            resolve('Failed to parse AI response.');
          }
        });
      });

      reqGroq.on('error', (e) => {
        console.error('Request error:', e.message);
        reject(e);
      });
      reqGroq.write(payload);
      reqGroq.end();
    });

    return res.status(200).json({ answer });
  } catch (e) {
    console.error('ai.js catch:', e.message);
    return res.status(200).json({ answer: 'Something went wrong. Please try again.' });
  }
}

function callGroq(apiKey, prompt, responseFormat, maxTokens) {
  const payload = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          responseFormat === 'object'
            ? 'You are a JSON extractor. Return ONLY a valid JSON object with no explanation, no markdown fences, no extra text.'
            : 'You are a JSON generator. Return ONLY valid JSON with no explanation or markdown.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens || 1000,
    temperature: 0.1,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (groqRes) => {
      let data = '';
      groqRes.on('data', (chunk) => (data += chunk));
      groqRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content || '{}');
        } catch {
          resolve('{}');
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
