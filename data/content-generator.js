/**
 * content-generator.js
 * Step 3 — generates brand-aware template content via Claude.
 * Takes: brand context + topic + intent::mode
 * Returns: exact data{} the template needs, validated against FIELD_SCHEMAS.
 */

const ContentGenerator = (() => {

  /* Human-readable descriptions of each mode for the prompt */
  const MODE_DESCRIPTIONS = {
    'dyk::stat':           'A single surprising statistic with count-up animation. The number is the hero.',
    'dyk::ratio':          'A 1-in-X ratio fact. e.g. "1 in 5 adults experience anxiety". Two numbers as hero.',
    'dyk::timeframe':      'How often something happens in a time unit. e.g. "Every 60 seconds, X happens".',
    'quote::portrait':     'An inspiring quote from a known person in this field, with their photo.',
    'quote::topic':        'A powerful quote tied to a specific theme label.',
    'quote::split':        'A quote split into a short dramatic hook and the full revealing body.',
    'tip::checklist':      'A practical tip broken into 3 short actionable checklist items.',
    'tip::do_dont':        'One clear contrast: the right way to do something vs the wrong way.',
    'tip::stat_tip':       'An actionable tip backed by a supporting statistic that makes it credible.',
    'funfact::versus':     'Two surprising things compared — the unexpected gap between them IS the fact.',
    'funfact::number_fact':'A surprising number styled playfully — the number itself stops the scroll.',
    'funfact::mind_blown': 'A two-part fact: a bold setup claim, then the proof that delivers the punchline.',
    'editorial::cover':    'A full-bleed editorial cover post with bold title and short description.',
    'carousel::listicle':    'A multi-slide listicle carousel. Each slide is one item from a numbered list.',
    'carousel::story_arc':   'A multi-slide story carousel: Hook → Build → Payoff → CTA narrative arc.',
    'carousel::step_by_step':'A multi-slide step-by-step carousel: Intro → Step 01 → Step 02... → CTA.',
    'carousel::comparison':  'A multi-slide comparison carousel: Setup → Side A → Side B → Verdict.',
  };

  /* ── Build field instructions from FIELD_SCHEMAS ──────────── */
  function buildFieldInstructions(key) {
    const schema = window.FieldSchemas?.FIELD_SCHEMAS?.[key] ?? {};
    const lines  = [];
    for (const [field, rules] of Object.entries(schema)) {
      if (rules.type === 'array') continue; /* skip chart_items etc */
      const req    = rules.required ? ' (REQUIRED)' : ' (optional)';
      const maxStr = rules.max ? `, max ${rules.max} chars` : '';
      lines.push(`  "${field}"${req}: ${rules.hint}${maxStr}. Example: "${rules.example}"`);
    }
    return lines.join('\n');
  }

  /* ── Generate content for one intent::mode ─────────────────── */
  async function generate({ key, topic }) {
    const brand     = window.BrandContext;
    const system    = brand.getSystemPrompt();
    const desc      = MODE_DESCRIPTIONS[key] ?? key;
    const isCarousel = key.startsWith('carousel::');

    let user, data;

    if (isCarousel) {
      /* Carousel — returns a JSON array of slide objects */
      const slideCount = key === 'carousel::story_arc' || key === 'carousel::comparison' ? 4 : 5;
      user = `Write a ${key.split('::')[1].replace(/_/g,' ')} carousel for ${brand.brand_name} on: "${topic}".
FORMAT: ${desc}
VOICE: ${brand.personal_touch}

Return ONLY a JSON array of exactly ${slideCount} objects, each with:
"heading" (max 60 chars), "body" (max 120 chars), "label" (e.g. Cover/01/CTA), "category" (topic tag), "image" ("https://picsum.photos/id/10/1080/1350")

First slide = hook. Last slide = CTA. Natural progression. No markdown.`;

      /* Fetch image in parallel */
      const [data, imageUrl] = await Promise.all([
        AIClient.callJSON({ system, user, maxTokens: 800 }),
        window.ImageFetcher ? window.ImageFetcher.fetchImage(topic) : Promise.resolve(null),
      ]);
      const slides = Array.isArray(data) ? data : [data];
      /* Apply same image to all slides */
      if (imageUrl) slides.forEach(s => { s.image = imageUrl; s.bg = imageUrl; });
      return slides;
    }

    /* Standard single-object templates */
    const fields = buildFieldInstructions(key);
    user = `Write social media post content for ${brand.brand_name}.

TOPIC: "${topic}"
FORMAT: ${key}
FORMAT DESCRIPTION: ${desc}

Return ONLY a valid JSON object with EXACTLY these fields:
${fields}

Important rules:
- Write in ${brand.brand_name}'s voice: ${brand.personal_touch}
- Content must relate to the topic: "${topic}"
- Every field must be genuinely useful and on-brand
- Do not exceed max character limits
- Return ONLY the JSON object — no markdown, no explanation`;

    /* Fetch relevant image in parallel with AI text generation */
    let imageUrl = null;
    [data, imageUrl] = await Promise.all([
      AIClient.callJSON({ system, user, maxTokens: 600 }),
      window.ImageFetcher ? window.ImageFetcher.fetchImage(topic) : Promise.resolve(null),
    ]);
    if (imageUrl && data && typeof data === 'object') {
      if ('image'      in data) data.image       = imageUrl;
      if ('bg'         in data) data.bg           = imageUrl;
      if ('photo_url'  in data) data.photo_url    = imageUrl;
      if ('avatar_url' in data) data.avatar_url   = imageUrl;
    }

    /* Validate required fields */
    if (window.FieldSchemas) {
      const validation = window.FieldSchemas.validateData(key, data);
      if (!validation.valid) {
      }
    }

    return data;
  }

  /* ── Generate for multiple keys in parallel ─────────────────── */
  async function generateBatch({ keys, topic }) {
    /* Run in parallel — one AI call per key */
    const results = await Promise.allSettled(
      keys.map(key => generate({ key, topic }))
    );

    const out = {};
    results.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        out[keys[i]] = res.value;
      } else {
        console.error(`[ContentGenerator] Failed for ${keys[i]}:`, res.reason);
        /* Fall back to dummy data for failed keys */
        out[keys[i]] = null;
      }
    });

    return out; /* { 'dyk::stat': data{}, 'tip::checklist': data{}, ... } */
  }

  return { generate, generateBatch };
})();

window.ContentGenerator = ContentGenerator;
