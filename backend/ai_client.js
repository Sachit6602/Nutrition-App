// One AI client for every bring-your-own-key provider.
// Every provider except Anthropic speaks the OpenAI chat-completions format, so they share callOpenAICompatible().
// Anthropic goes through the official @anthropic-ai/sdk (Messages API).
// Callers always pass OpenAI-style messages: content is a string, or parts of
//   { type: 'text', text } | { type: 'image_url', image_url: { url } }   (url may be a data: URL)
import Anthropic from '@anthropic-ai/sdk';

// Thrown for non-2xx upstream responses so routes can map 401/402/403/429 to user-facing codes.
export class AiError extends Error {
  constructor(status, message, provider) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.provider = provider;
  }
}

// Bad key / out of credits: these must reach the user, never be swallowed or masked with sample data.
export const isKeyError = (err) => err instanceof AiError && [401, 402, 403].includes(err.status);

const env = (name, fallback) => process.env[name] || fallback;

// models: text = fast JSON-capable model, vision = accepts image parts, search = live web search (optional).
// tokenParam: the max-output-tokens field name on that API. verify: GET path that checks a key without spending tokens.
// prefix: auto-detects the provider from a pasted key (providers whose keys have no distinctive prefix must be picked).
export const PROVIDERS = {
  // Model IDs checked against each provider's docs on 2026-11-04. Every one can be overridden with the env var shown.
  openrouter: {
    label: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys', placeholder: 'sk-or-v1-...', prefix: /^sk-or-/,
    base: 'https://openrouter.ai/api/v1', verify: '/key', tokenParam: 'max_tokens',
    models: {
      text: env('OPENROUTER_TEXT_MODEL', 'google/gemini-3-flash-preview'),
      // Not gemini-3-pro-image-preview: that one generates images rather than reading them.
      vision: env('CV_MODEL', 'google/gemini-3-flash-preview'),
      search: env('PERPLEXITY_MODEL', 'perplexity/sonar-pro'),
    },
  },
  openai: {
    label: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', placeholder: 'sk-proj-...', prefix: /^sk-(proj|svcacct)-/,
    base: 'https://api.openai.com/v1', verify: '/models', tokenParam: 'max_completion_tokens', fixedTemperature: true,
    models: {
      text: env('OPENAI_TEXT_MODEL', 'gpt-6-luna'),
      vision: env('OPENAI_VISION_MODEL', 'gpt-6-luna'),
      search: env('OPENAI_SEARCH_MODEL', 'gpt-5-search-api'),
    },
  },
  anthropic: {
    label: 'Anthropic (Claude)', keyUrl: 'https://console.anthropic.com/settings/keys', placeholder: 'sk-ant-...', prefix: /^sk-ant-/,
    sdk: 'anthropic',
    models: { text: env('ANTHROPIC_MODEL', 'claude-opus-5-5'), vision: env('ANTHROPIC_MODEL', 'claude-opus-5-5') },
  },
  google: {
    // Newer AI Studio keys start "AQ." and older ones "AIza"; neither is guaranteed, so users can also pick it.
    label: 'Google Gemini', keyUrl: 'https://aistudio.google.com/apikey', placeholder: 'AIza... or AQ....', prefix: /^(AIza|AQ\.)/,
    base: 'https://generativelanguage.googleapis.com/v1beta/openai', verify: '/models', tokenParam: 'max_tokens', badKey400: true,
    models: { text: env('GEMINI_TEXT_MODEL', 'gemini-3.8-flash'), vision: env('GEMINI_VISION_MODEL', 'gemini-3.8-flash') },
  },
  groq: {
    label: 'Groq', keyUrl: 'https://console.groq.com/keys', placeholder: 'gsk_...', prefix: /^gsk_/,
    base: 'https://api.groq.com/openai/v1', verify: '/models', tokenParam: 'max_tokens',
    models: { text: env('GROQ_TEXT_MODEL', 'openai/gpt-oss-20b'), vision: env('GROQ_VISION_MODEL', 'qwen/qwen3.8-27b') },
  },
  perplexity: {
    label: 'Perplexity', keyUrl: 'https://www.perplexity.ai/account/api/keys', placeholder: 'pplx-...', prefix: /^pplx-/,
    base: 'https://api.perplexity.ai', verify: '/v1/models', tokenParam: 'max_tokens',
    // ponytail: Perplexity now serves chat completions through its Agent API shim; move to /v1/agent if the shim goes away.
    models: { text: env('PPLX_TEXT_MODEL', 'sonar'), vision: null, search: env('PPLX_SEARCH_MODEL', 'sonar') },
  },
  xai: {
    label: 'xAI (Grok)', keyUrl: 'https://console.x.ai', placeholder: 'xai-...', prefix: /^xai-/,
    base: 'https://api.x.ai/v1', verify: '/models', tokenParam: 'max_tokens', badKey400: true,
    models: { text: env('XAI_TEXT_MODEL', 'grok-4.7'), vision: env('XAI_VISION_MODEL', 'grok-4.7') },
  },
  mistral: {
    label: 'Mistral', keyUrl: 'https://console.mistral.ai/api-keys', placeholder: 'Your Mistral key', prefix: null,
    base: 'https://api.mistral.ai/v1', verify: '/models', tokenParam: 'max_tokens', imageUrlAsString: true,
    models: { text: env('MISTRAL_TEXT_MODEL', 'mistral-small-latest'), vision: env('MISTRAL_VISION_MODEL', 'mistral-small-latest') },
  },
  deepseek: {
    // DeepSeek keys start "sk-" like OpenAI's, so it is never auto-detected: users pick it.
    label: 'DeepSeek', keyUrl: 'https://platform.deepseek.com/api_keys', placeholder: 'sk-...', prefix: null,
    base: 'https://api.deepseek.com', verify: '/models', tokenParam: 'max_tokens',
    models: { text: env('DEEPSEEK_TEXT_MODEL', 'deepseek-flash'), vision: env('DEEPSEEK_VISION_MODEL', 'deepseek-flash') },
  },
};

export const isProvider = (id) => Object.hasOwn(PROVIDERS, id);
export const providerLabel = (id) => PROVIDERS[id]?.label || 'your AI provider';

// Best guess from the key's prefix; null when ambiguous (the user then picks the provider).
export function detectProvider(key) {
  const k = String(key || '');
  for (const [id, p] of Object.entries(PROVIDERS)) if (p.prefix && p.prefix.test(k)) return id;
  return null;
}

// Safe to send to the browser: no URLs we call, no env values.
export const publicProviders = () => Object.entries(PROVIDERS).map(([id, p]) => ({
  id, label: p.label, keyUrl: p.keyUrl, placeholder: p.placeholder,
  prefix: p.prefix ? p.prefix.source : null, vision: Boolean(p.models.vision), webSearch: Boolean(p.models.search),
}));

// ---------- Verify a key without spending tokens: 'valid' | 'invalid' | 'unverified' ----------
export async function verifyKey(providerId, key, fetchImpl = fetch) {
  const p = PROVIDERS[providerId];
  if (!p) return 'invalid';
  if (p.sdk === 'anthropic') {
    try {
      await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 8000 }).models.list({ limit: 1 });
      return 'valid';
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return 'invalid';
      return 'unverified';
    }
  }
  // No free check endpoint: a 1-token completion is the cheapest proof the key works.
  const probe = p.verify
    ? fetchImpl(p.base + p.verify, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })
    : fetchImpl(`${p.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: p.models.text, messages: [{ role: 'user', content: 'hi' }], [p.tokenParam]: 1 }),
      signal: AbortSignal.timeout(10000),
    });
  let resp;
  try { resp = await probe; } catch { return 'unverified'; }
  // xAI and Gemini answer a bad key with 400 rather than 401.
  if (resp.status === 401 || resp.status === 403 || (p.badKey400 && resp.status === 400)) return 'invalid';
  return resp.ok ? 'valid' : 'unverified';
}

// ---------- Chat ----------
// ai: { provider, apiKey }. kind: 'text' | 'vision' | 'search' (search falls back to text when the provider has none).
// Returns { content, model, webSearch } where webSearch says whether the model could actually browse.
export async function chat(ai, messages, { kind = 'text', temperature = 0.2, maxTokens = 1200 } = {}) {
  const p = PROVIDERS[ai?.provider];
  if (!p) throw new Error(`chat: unknown provider "${ai?.provider}"`);
  if (!ai.apiKey) throw new Error('chat: apiKey is required');
  const model = p.models[kind] || p.models.text;
  if (kind === 'vision' && !p.models.vision) {
    const err = new AiError(400, `${p.label} can't read photos. Use a provider with vision for photo logging.`, ai.provider);
    err.code = 'NO_VISION';
    throw err;
  }
  const webSearch = kind === 'search' && Boolean(p.models.search);
  const out = p.sdk === 'anthropic'
    ? await callAnthropic(ai.apiKey, model, messages, maxTokens)
    : await callOpenAICompatible(p, ai, model, messages, { temperature, maxTokens });
  return { ...out, webSearch };
}

async function callOpenAICompatible(p, ai, model, messages, { temperature, maxTokens }) {
  const headers = { Authorization: `Bearer ${ai.apiKey}`, 'Content-Type': 'application/json' };
  if (ai.provider === 'openrouter') {
    if (process.env.SITE_URL) headers['HTTP-Referer'] = process.env.SITE_URL;
    if (process.env.SITE_NAME) headers['X-Title'] = process.env.SITE_NAME;
  }
  // Mistral documents image_url as a plain string rather than { url }.
  const msgs = p.imageUrlAsString
    ? messages.map((m) => (Array.isArray(m.content)
      ? { ...m, content: m.content.map((c) => (c.type === 'image_url' ? { type: 'image_url', image_url: c.image_url?.url } : c)) }
      : m))
    : messages;
  const body = { model, messages: msgs, [p.tokenParam]: maxTokens };
  if (!p.fixedTemperature) body.temperature = temperature;

  const resp = await fetch(`${p.base}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
  });
  const text = await resp.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* handled below */ }
  if (!resp.ok) {
    const raw = data?.error?.message ?? data?.error ?? data?.message ?? text.slice(0, 300);
    throw new AiError(resp.status, `${p.label} API error (status ${resp.status}): ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`, ai.provider);
  }
  if (!data) throw new Error(`${p.label}: invalid JSON response (status ${resp.status})`);
  const msg = data.choices?.[0]?.message;
  const content = typeof msg === 'string' ? msg : msg?.content;
  return { content: Array.isArray(content) ? content.map((c) => c.text || '').join('') : content || '', model: data.model || model };
}

// OpenAI-style messages -> Anthropic Messages API (system is top-level; images become image blocks).
export function toAnthropic(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : m.content.map((part) => {
      if (part.type !== 'image_url') return { type: 'text', text: part.text || '' };
      const url = part.image_url?.url || '';
      const data = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(url);
      return data
        ? { type: 'image', source: { type: 'base64', media_type: data[1].toLowerCase(), data: data[2] } }
        : { type: 'image', source: { type: 'url', url } };
    }),
  }));
  return { system, messages: rest };
}

async function callAnthropic(apiKey, model, messages, maxTokens) {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const { system, messages: msgs } = toAnthropic(messages);
  let response;
  try {
    // Thinking is always on for Claude Opus 5.5; effort is the depth control (its default is medium; set explicitly).
    // fallbacks: "default" lets the API re-run a policy-declined request on a suitable model inside the same call.
    response = await client.beta.messages.create({
      model,
      max_tokens: Math.max(maxTokens, 16000),
      ...(system ? { system } : {}),
      messages: msgs,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status) throw new AiError(err.status, `Anthropic API error (status ${err.status}): ${err.message}`, 'anthropic');
    throw err;
  }
  if (response.stop_reason === 'refusal') {
    throw new AiError(422, 'Claude declined this request.', 'anthropic');
  }
  const content = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { content, model: response.model };
}
