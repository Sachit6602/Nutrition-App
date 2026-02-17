import dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function _extractChoice(data) {
  try {
    const choice = data?.choices?.[0];
    const message = choice?.message || {};
    const content = typeof message === 'string' ? message : message?.content || '';
    const reasoning = message?.reasoning || message?.metadata || null;
    return { content, reasoning, raw: choice };
  } catch (e) {
    return { content: '', reasoning: null, raw: null };
  }
}

export async function callOpenRouter(messages, opts = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not configured in environment');

  const model = opts.model || 'google/gemini-3-flash-preview';
  const withReasoning = Boolean(opts.withReasoning);

  const body = {
    model,
    messages,
    // default options — can be overridden via opts
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.max_tokens ?? 800,
    // OpenRouter supports an extra_body field for provider-specific flags
    extra_body: opts.extra_body || (withReasoning ? { include_reasoning: true } : {}),
  };

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`OpenRouter: invalid JSON response (status ${resp.status}): ${text.slice(0, 200)}`);
  }

  if (!resp.ok) {
    const rawErr = data?.error ?? data?.message ?? data;
    const errMsg = typeof rawErr === 'string' ? rawErr : JSON.stringify(rawErr);
    throw new Error(`OpenRouter API error (status ${resp.status}): ${errMsg}`);
  }

  const { content, reasoning, raw } = _extractChoice(data);
  return { content: content || '', reasoning_details: reasoning || null, raw };
}

export default callOpenRouter;
