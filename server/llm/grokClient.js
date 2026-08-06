/**
 * Grok (xAI) API client.
 *
 * The xAI API is OpenAI-compatible (POST {base}/chat/completions). The app is
 * designed to run on AWS (see docs/DEPLOY_AWS.md) with the key supplied via
 * environment / AWS Secrets Manager.
 *
 * Every call site passes a `mock` fallback so the whole simulator remains
 * fully playable with no API key (offline demo mode).
 */

const DEFAULTS = {
  baseUrl: process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
  model: process.env.GROK_MODEL || 'grok-4',
  apiKey: process.env.GROK_API_KEY || '',
  timeoutMs: Number(process.env.GROK_TIMEOUT_MS || 90000),
};

export function hasLiveModel() {
  return Boolean(DEFAULTS.apiKey);
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
  if (search) body.search_parameters = { mode: 'auto', return_citations: true };

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
