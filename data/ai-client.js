/**
 * ai-client.js
 * Single wrapper for all Claude API calls.
 * API key stored in localStorage — user pastes once via settings modal.
 * Same pattern as the GitHub token in template-editor.html.
 */

const AIClient = (() => {

  const STORAGE_KEY = 'anthropic_api_key';
  const MODEL        = 'claude-sonnet-4-6';
  const API_URL      = 'https://api.anthropic.com/v1/messages';

  /* ── Key management ─────────────────────────────────────── */
  function getKey()       { return localStorage.getItem(STORAGE_KEY) ?? ''; }
  function setKey(k)      { localStorage.setItem(STORAGE_KEY, k.trim()); }
  function clearKey()     { localStorage.removeItem(STORAGE_KEY); }
  function hasKey()       { return !!getKey(); }

  /* ── Core call ──────────────────────────────────────────── */
  async function call({ system, user, maxTokens = 1000 }) {
    const key = getKey();
    if (!key) throw new Error('No API key — open Settings to add your Anthropic key');

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message ?? `API error ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    return text;
  }

  /* ── JSON call — strips markdown fences, parses safely ──── */
  async function callJSON({ system, user, maxTokens = 1000 }) {
    const raw = await call({ system, user, maxTokens });
    /* Strip markdown code fences if present */
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/,'').trim();
    try {
      return JSON.parse(clean);
    } catch(e) {
      console.error('[AIClient] JSON parse failed. Raw response:', raw);
      throw new Error('AI returned invalid JSON — try again');
    }
  }

  /* ── Verify key is valid ─────────────────────────────────── */
  async function verifyKey(testKey) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         testKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });
    if (res.status === 401) throw new Error('Invalid API key');
    if (res.status === 403) throw new Error('API key lacks permission');
    /* 200 or any other non-401 means key is valid */
    return true;
  }

  return { call, callJSON, getKey, setKey, clearKey, hasKey, verifyKey };
})();

window.AIClient = AIClient;
