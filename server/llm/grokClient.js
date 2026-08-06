/**
 * Grok API client — two interchangeable providers, one protocol.
 *
 * Grok 4.3 is reachable through two OpenAI-compatible chat-completions
 * endpoints, selected with LLM_PROVIDER:
 *
 *   xai      — SpaceXAI's native API: https://api.x.ai/v1, key from
 *              console.x.ai, model "grok-4.3". Supports Live Search.
 *   bedrock  — AWS-native Amazon Bedrock (bedrock-mantle endpoint):
 *              https://bedrock-mantle.{region}.api.aws/openai/v1, auth with a
 *              Bedrock API key (Bedrock console → API keys), model
 *              "xai.grok-4.3". Available in us-east-1, us-east-2, us-west-2.
 *
 * Every call site passes a `mock` fallback so the whole simulator remains
 * fully playable with no API key (offline demo mode).
 */

const REGION = process.env.AWS_REGION || 'us-east-1';
const PRESETS = {
  xai: { baseUrl: 'https://api.x.ai/v1', model: 'grok-4.3' },
  bedrock: { baseUrl: `https://bedrock-mantle.${REGION}.api.aws/openai/v1`, model: 'xai.grok-4.3' },
};
const PROVIDER = (
  process.env.LLM_PROVIDER ||
  (process.env.GROK_BASE_URL?.includes('bedrock') ? 'bedrock' : 'xai')
).toLowerCase();
const PRESET = PRESETS[PROVIDER] || PRESETS.xai;

// Each provider prefers its own key, so both may be configured at once —
// the recommended setup: Bedrock runs the courtroom, the native SpaceXAI key
// powers Agent Tools web research. AWS_BEARER_TOKEN_BEDROCK is the
// conventional env name for Bedrock API keys.
const KEYS = {
  xai: process.env.GROK_API_KEY || process.env.AWS_BEARER_TOKEN_BEDROCK || '',
  bedrock: process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.GROK_API_KEY || '',
};
// Web research authenticates against api.x.ai and therefore needs a real
// native key — the Bedrock token cannot be used there.
const NATIVE_KEY = process.env.GROK_API_KEY || '';

const DEFAULTS = {
  baseUrl: process.env.GROK_BASE_URL || PRESET.baseUrl,
  model: process.env.GROK_MODEL || PRESET.model,
  apiKey: KEYS[PROVIDER] || KEYS.xai,
  timeoutMs: Number(process.env.GROK_TIMEOUT_MS || 90000),
};

export function hasLiveModel() {
  return Boolean(DEFAULTS.apiKey);
}

export function providerInfo() {
  return {
    provider: PROVIDER,
    model: DEFAULTS.model,
    baseUrl: DEFAULTS.baseUrl,
    live: hasLiveModel(),
    liveSearch: Boolean(NATIVE_KEY),
  };
}

/**
 * chat(messages, opts)
 *  messages: [{role:'system'|'user'|'assistant', content}]
 *  opts:
 *    json      – ask for / parse a JSON object response
 *    temperature
 *    mock(ctx) – REQUIRED fallback used when no API key is configured or the
 *                call fails; must return the same shape the caller expects
 *                (string, or object when opts.json).
 */
export async function chat(messages, opts = {}) {
  const { json = false, temperature = 0.7, mock } = opts;
  // Per-call provider override (opts.provider) lets latency-critical calls
  // route to whichever endpoint is healthier — e.g. case generation on the
  // native API while the courtroom runs on Bedrock. Falls back to the
  // session default when the requested provider has no key.
  const prov =
    opts.provider === 'xai' && NATIVE_KEY ? 'xai'
    : opts.provider === 'bedrock' && process.env.AWS_BEARER_TOKEN_BEDROCK ? 'bedrock'
    : null;
  const baseUrl = prov ? PRESETS[prov].baseUrl : DEFAULTS.baseUrl;
  const model = opts.model || (prov ? PRESETS[prov].model : DEFAULTS.model);
  const apiKey = prov ? (prov === 'xai' ? NATIVE_KEY : KEYS.bedrock) : DEFAULTS.apiKey;
  if (!apiKey) return mock ? mock() : null;
  const timeoutMs = opts.timeoutMs || DEFAULTS.timeoutMs;
  const attempts = opts.attempts || 3;

  const body = {
    model,
    messages,
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };
  // Grok 4.3's always-on reasoning can be dialed down per call (opts.effort:
  // 'none'|'low'|'medium'|'high') — big latency win for creative/mechanical
  // calls. Verified on bedrock-mantle; guarded there to avoid rejects elsewhere.
  if (opts.effort && (prov || PROVIDER) === 'bedrock') body.reasoning_effort = opts.effort;

  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`xAI API ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      return json ? parseJsonLoose(content, mock) : content;
    } catch (err) {
      lastErr = err;
      // retry transient failures with backoff
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  console.error('[grok] falling back to offline mode:', lastErr?.message);
  return mock ? mock() : null;
}

/**
 * Web research via the SpaceXAI Agent Tools API (Responses endpoint with a
 * server-side web_search tool). Native provider only — Bedrock's mantle
 * endpoint does not expose agent tools. The model runs searches on xAI's
 * servers and returns a cited answer.
 */
export async function researchWithWebSearch({ instructions, input, mock }) {
  if (!NATIVE_KEY) return mock ? mock() : null;
  const body = {
    // Research always hits api.x.ai, so it always uses the NATIVE model id —
    // never the Bedrock id, even when the courtroom provider is bedrock.
    model: process.env.RESEARCH_MODEL || PRESETS.xai.model,
    instructions,
    input,
    tools: [{ type: 'web_search' }],
    stream: false,
  };
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 180000);
      const res = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NATIVE_KEY}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`xAI Responses API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
      const data = await res.json();
      const text = extractResponsesText(data);
      if (text) return text;
      throw new Error('empty Responses API output');
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  console.error('[grok] web research failed:', lastErr?.message);
  return mock ? mock() : null;
}

/** Pull the final text out of a Responses API payload (shape-tolerant). */
function extractResponsesText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if (typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}

/** Tolerant JSON extraction — models occasionally wrap JSON in prose/fences. */
export function parseJsonLoose(text, mock) {
  if (typeof text !== 'string') return text;
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.unshift(fenced[1]);
  const braces = text.match(/\{[\s\S]*\}/);
  if (braces) candidates.push(braces[0]);
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  console.error('[grok] unparseable JSON response:', text.slice(0, 200));
  return mock ? mock() : null;
}
