import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_STREAM_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse';

interface FollowUpHistoryEntry {
  role: 'user' | 'model';
  text: string;
}

interface FollowUpPayload {
  prompt: string;
  context: Record<string, unknown>;
  history?: FollowUpHistoryEntry[];
}

function buildGeminiContents(payload: FollowUpPayload) {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  const contextText =
    'You are assisting an instructor who is reviewing automated grading results. ' +
    'Use the following JSON payload as the authoritative source for what was evaluated. ' +
    'Reference the specific grading context, feedback, awarded score, and answer model when helpful.\n\n' +
    JSON.stringify(payload.context, null, 2);

  contents.push({
    role: 'user',
    parts: [{ text: contextText }],
  });

  if (Array.isArray(payload.history)) {
    for (const entry of payload.history) {
      if (!entry || (entry.role !== 'user' && entry.role !== 'model')) continue;
      const trimmed = (entry.text ?? '').toString().trim();
      if (!trimmed) continue;
      contents.push({
        role: entry.role,
        parts: [{ text: trimmed }],
      });
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: payload.prompt }],
  });

  return contents;
}

function processBuffer(
  segment: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
) {
  const lines = segment
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      const parts = parsed?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) continue;

      const text = parts
        .map((part: { text?: string }) => part?.text ?? '')
        .join('');

      if (text) {
        controller.enqueue(encoder.encode(text));
      }
    } catch (error) {
      console.error('Failed to parse Gemini stream chunk', error);
    }
  }
}

function streamGeminiResponse(geminiResponse: Response): ReadableStream<Uint8Array> {
  const reader = geminiResponse.body?.getReader();
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();

  if (!reader) {
    throw new Error('Gemini response did not include a readable stream.');
  }

  let buffer = '';

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.length > 0) {
          processBuffer(buffer, controller, textEncoder);
          buffer = '';
        }
        controller.close();
        return;
      }

      buffer += textDecoder.decode(value, { stream: true });
      const segments = buffer.split('\n\n');
      buffer = segments.pop() ?? '';

      for (const segment of segments) {
        processBuffer(segment, controller, textEncoder);
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  let payload: FollowUpPayload;
  try {
    payload = await req.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body', details: String(error) }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
    return new Response(JSON.stringify({ error: 'Prompt is required' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  if (!payload.context || typeof payload.context !== 'object') {
    return new Response(JSON.stringify({ error: 'Context payload is required' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Gemini API key is not configured.' }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  const contents = buildGeminiContents({
    prompt: payload.prompt.trim(),
    context: payload.context,
    history: payload.history ?? [],
  });

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(GEMINI_STREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({ contents }),
    });
  } catch (error) {
    console.error('Failed to reach Gemini streaming endpoint', error);
    return new Response(JSON.stringify({ error: 'Failed to reach Gemini service.' }), {
      status: 502,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  if (!geminiResponse.ok || !geminiResponse.body) {
    const errorText = await geminiResponse.text();
    console.error('Gemini streaming request failed', errorText);
    return new Response(
      JSON.stringify({ error: 'Gemini request failed', details: errorText || geminiResponse.statusText }),
      {
        status: 502,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = streamGeminiResponse(geminiResponse);
  } catch (error) {
    console.error('Failed to create streaming response', error);
    return new Response(JSON.stringify({ error: 'Failed to process Gemini stream.' }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
});
