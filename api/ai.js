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
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: isJsonMode
              ? 'You are a JSON generator. Return ONLY valid JSON arrays with no explanation, no markdown, no extra text. Never add text before or after the JSON.'
              : 'You are a career assistant for HireTrack, a Karnataka job portal. Give practical advice in 3-4 sentences for the Indian job market.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: isJsonMode ? 1500 : 300,
        temperature: isJsonMode ? 0.3 : 0.7
      })
    });

    const data = await groqRes.json();
    const answer = data.choices?.[0]?.message?.content || 'No response received.';
    return res.status(200).json({ answer });

  } catch(e) {
    return res.status(200).json({ answer: `Error: ${e.message}` });
  }
}
