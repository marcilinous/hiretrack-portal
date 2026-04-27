export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, mode } = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return res.status(200).json({ answer: 'API key not configured.' });
    }

    // JSON mode for interview questions, chat mode for career assistant
    const isJsonMode = mode === 'json';

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: isJsonMode
              ? 'You are a JSON generator. Return ONLY valid JSON arrays with no explanation, no markdown, no extra text. Never add text before or after the JSON.'
              : 'You are a career assistant for HireTrack, India's growing job portal. Give practical, actionable advice in 3-4 sentences for the Indian job market across all industries and cities.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: isJsonMode ? 2000 : 300,
        temperature: isJsonMode ? 0.3 : 0.7
      })
    });

    const data = await groqRes.json();
    if (!groqRes.ok) {
      console.error('Groq error:', JSON.stringify(data));
      return res.status(200).json({ answer: 'AI service is temporarily unavailable. Please try again in a moment.' });
    }
    const answer = data.choices?.[0]?.message?.content || 'No response received.';
    return res.status(200).json({ answer });

  } catch(e) {
    console.error('ai.js error:', e.message);
    return res.status(200).json({ answer: 'Something went wrong. Please try again.' });
  }
}
