exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt } = JSON.parse(event.body);
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ answer: 'API key not configured in Netlify environment variables.' })
      };
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

    const rawText = await groqRes.text();
    console.log('Groq raw response:', rawText);

    if (!groqRes.ok) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ answer: `Groq API error ${groqRes.status}: ${rawText}` })
      };
    }

    const data = JSON.parse(rawText);
    const answer = data.choices?.[0]?.message?.content || 'No response from AI. Please try again.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ answer })
    };

  } catch(e) {
    console.log('Function error:', e.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ answer: `Error: ${e.message}` })
    };
  }
};
