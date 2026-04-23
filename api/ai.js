export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return res.status(200).json({ answer: 'API key not configured in Vercel environment variables.' });
    }

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
            content: 'You are a career assistant for HireTrack, a Karnataka job portal for MIS, Data, Excel and SQL roles. Give practical advice in 3-4 sentences for the Indian job market.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    });

    const data = await groqRes.json();
    const answer = data.choices?.[0]?.message?.content || 'No response received. Please try again.';

    return res.status(200).json({ answer });

  } catch(e) {
    return res.status(200).json({ answer: `Error: ${e.message}` });
  }
}
