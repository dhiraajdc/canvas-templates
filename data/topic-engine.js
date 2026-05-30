/**
 * topic-engine.js
 * Step 1 — generates brand-relevant topic suggestions.
 * Step 2 — scores templates against a selected topic.
 *
 * Topics cached per session. Refresh clears cache and regenerates.
 * Avoids repeating topics across refreshes within same session.
 */

const TopicEngine = (() => {

  /* Ready templates available for scoring */
  const READY_TEMPLATES = [
    'dyk::stat', 'dyk::ratio', 'dyk::timeframe',
    'quote::portrait', 'quote::topic', 'quote::split',
    'tip::checklist', 'tip::do_dont', 'tip::stat_tip',
    'funfact::versus', 'funfact::number_fact', 'funfact::mind_blown',
    'market::day_chart', 'news::headline',
  ];

  /* Session cache — persists until user clicks Refresh */
  let _cachedTopics  = null;   /* array of topic strings */
  let _shownTopics   = new Set(); /* tracks all topics ever shown this session */

  /* ── Generate topic suggestions ─────────────────────────────
     Returns array of 5 topic objects:
     [{ topic, rationale }]
  ─────────────────────────────────────────────────────────── */
  async function getSuggestions({ forceRefresh = false } = {}) {
    if (_cachedTopics && !forceRefresh) return _cachedTopics;

    const brand   = window.BrandContext;
    const system  = brand.getSystemPrompt();
    const shown   = _shownTopics.size > 0
      ? `\n\nDo NOT suggest any of these already-shown topics:\n${[..._shownTopics].join('\n')}`
      : '';

    const user = `Generate exactly 3 social media content topic suggestions for ${brand.brand_name}.

Each topic should:
- Be specific and actionable (not vague like "wellness tips")
- Resonate with the audience: ${brand.target_audience}
- Address their pain points: ${brand.audience_pain_points}
- Fit the brand voice: ${brand.personal_touch}
- Be suitable for a short-form social media post (not a blog article)
${shown}

Return ONLY a JSON array of 3 objects, each with:
  "topic"     — the content topic (max 60 chars, punchy)
  "rationale" — one sentence why this works for the brand (max 80 chars)

Example format:
[
  { "topic": "3 signs your morning routine needs a spiritual reset", "rationale": "Speaks directly to the audience's disconnection pain point." },
  ...
]`;

    const result = await AIClient.callJSON({ system, user, maxTokens: 600 });

    /* Validate and cap */
    const topics = Array.isArray(result)
      ? result.slice(0, 3).filter(t => t.topic && t.rationale)
      : [];

    if (topics.length === 0) throw new Error('AI returned no valid topics');

    /* Cache and track shown topics */
    _cachedTopics = topics;
    topics.forEach(t => _shownTopics.add(t.topic));

    return topics;
  }

  /* ── Score templates for a given topic ──────────────────────
     Returns ordered array of top 3 intent::mode keys.
     Used to pre-select cards in the creator sheet.
  ─────────────────────────────────────────────────────────── */
  async function scoreTemplates(topic) {
    const brand  = window.BrandContext;
    const system = brand.getSystemPrompt();

    const templateDescriptions = {
      'dyk::stat':           'Did You Know: one large statistic with count-up animation',
      'dyk::ratio':          'Did You Know: 1-in-X ratio format (e.g. 1 in 5 adults)',
      'dyk::timeframe':      'Did You Know: how often something happens in a time period',
      'quote::portrait':     'Quote: author quote with circular portrait photo',
      'quote::topic':        'Quote: quote tied to a named topic/theme label',
      'quote::split':        'Quote: dramatic split — hook sentence then full quote reveal',
      'tip::checklist':      'Tip: 3-item checklist with tick marks',
      'tip::do_dont':        'Tip: do vs don\'t contrast blocks',
      'tip::stat_tip':       'Tip: actionable advice backed by a supporting statistic',
      'funfact::versus':     'Fun Fact: two surprising things compared — the gap is the fact',
      'funfact::number_fact':'Fun Fact: a surprising number styled playfully',
      'funfact::mind_blown': 'Fun Fact: setup then twist — the reveal is the punchline',
    };

    const user = `Given this topic and brand context, which 3 social media post formats would work best?

TOPIC: "${topic}"

AVAILABLE FORMATS:
${Object.entries(templateDescriptions).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

Consider:
- Which formats best suit this specific topic
- Which formats match the brand voice: ${brand.personal_touch}
- Which formats will resonate with: ${brand.target_audience}

Return ONLY a JSON array of exactly 3 format keys, ordered best to worst.
Example: ["tip::checklist", "dyk::stat", "funfact::mind_blown"]`;

    const result = await AIClient.callJSON({ system, user, maxTokens: 200 });

    /* Validate — must be array of known keys */
    const valid = Array.isArray(result)
      ? result.filter(k => READY_TEMPLATES.includes(k)).slice(0, 3)
      : [];

    /* Fallback if AI returns garbage */
    if (valid.length === 0) return ['dyk::stat', 'tip::checklist', 'funfact::mind_blown'];

    return valid;
  }

  /* ── Pick single best template (for empty state flow) ───────
     Returns one intent::mode key.
  ─────────────────────────────────────────────────────────── */
  async function pickBestTemplate(topic) {
    const scored = await scoreTemplates(topic);
    return scored[0];
  }

  /* ── Clear cache (Refresh button) ───────────────────────── */
  function clearCache() { _cachedTopics = null; }

  return { getSuggestions, scoreTemplates, pickBestTemplate, clearCache };
})();

window.TopicEngine = TopicEngine;
