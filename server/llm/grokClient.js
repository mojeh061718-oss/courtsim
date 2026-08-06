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

const DEFAULTS = {
  baseUrl: process.env.GROK_BASE_URL || PRESET.baseUrl,
  model: process.env.GROK_MODEL || PRESET.model,
  // AWS_BEARER_TOKEN_BEDROCK is the conventional env name for Bedrock API keys.
  apiKey: process.env.GROK_API_KEY || process.env.AWS_BEARER_TOKEN_BEDROCK || '',
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
    liveSearch: PROVIDER === 'xai' && hasLiveModel(),
  };
}

/**
 * chat(messages, opts)
 *  messages: [{role:'system'|'user'|'assistant', content}]
 *  opts:
 *    json      – ask for / parse a JSON object response
 *    temperature
 *    search    – enable xAI Live Search (used by the public-data research module)
 *    mock(ctx) – REQUIRED fallback used when no API key is configured or the
 *                call fails; must return the same shape the caller expects
 *                (string, or object when opts.json).
 */
export async function chat(messages, opts = {}) {
  const { json = false, temperature = 0.7, search = false, mock } = opts;
  if (!DEFAULTS.apiKey) return mock ? mock() : null;

  const body = {
    model: opts.model || DEFAULTS.model,
    messages,
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };
  // search_parameters (Live Search) is a native-xAI extension; Bedrock's
  // bedrock-mantle endpoint would reject the unknown field.
  if (search && PROVIDER === 'xai') body.search_parameters = { mode: 'auto', return_citations: true };

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), DEFAULTS.timeoutMs);
      const res = await fetch(`${DEFAULTS.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEFAULTS.apiKey}`,
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
