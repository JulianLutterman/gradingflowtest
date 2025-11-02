const resolveGeminiApiKey = () => {
  const {
    GEMINI_API_KEY = '',
    NEXT_PUBLIC_GEMINI_API_KEY = '',
    VERCEL_GEMINI_API_KEY = '',
  } = process.env || {};

  return GEMINI_API_KEY || NEXT_PUBLIC_GEMINI_API_KEY || VERCEL_GEMINI_API_KEY || '';
};

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }));
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      geminiApiKey: apiKey,
    })
  );
};
