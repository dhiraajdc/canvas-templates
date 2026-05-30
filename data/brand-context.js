/**
 * brand-context.js
 * Hardcoded brand profile — replace with Firebase fetch later.
 * Single source of truth for all AI calls and template styling.
 */

const BrandContext = {

  /* ── Core identity ──────────────────────────────────────── */
  brand_name:           "OmPeace",
  business_description: "A spirituality-focused wellness brand promoting holistic health and inner peace.",
  industry:             "Healthcare & Wellness",
  products_services:    "Meditation sessions, spiritual coaching, wellness workshops, mindfulness products",
  business_type:        "B2C",
  website:              "ompeace.com",
  hashtags:             "#OmPeace #Mindfulness #Wellness #SpiritualGrowth #InnerPeace",

  /* ── Audience ───────────────────────────────────────────── */
  target_audience:      "Individuals seeking spiritual growth, stress relief, and holistic wellness",
  target_demographics:  "Adults aged 25–50 interested in spirituality and wellness",
  audience_pain_points: "Stress, anxiety, lack of inner peace, disconnection from self",
  audience_objectives:  "Achieve mental clarity, emotional balance, and spiritual fulfillment",

  /* ── Voice & tone ───────────────────────────────────────── */
  brand_voice:          "Calm, supportive, inspiring, and empathetic",
  personal_touch:       "Fun & Friendly with gyan and knowledge and a touch of humour",
  brand_niche:          "Spiritual wellness and mindfulness in healthcare",
  brand_personality:    "Tranquil, nurturing, wise, approachable",

  /* ── Values & positioning ───────────────────────────────── */
  core_values:          "Peace, mindfulness, authenticity, holistic health, personal growth",
  unique_selling_point: "Integrating ancient spiritual practices with modern wellness techniques for balanced living",
  competitive_advantage:"Combines traditional spirituality with accessible modern wellness practices",

  /* ── Brand visuals ──────────────────────────────────────────
     Applied to every template fetched from GitHub.
     primary     — main accent color (stat numbers, rules, tags)
     background  — canvas background
     text        — primary text color
     muted       — secondary/caption text
     surface     — card/layer backgrounds
     fonts       — typography stack
  ──────────────────────────────────────────────────────────── */
  brand_visuals: {
    logo: "OM·PEACE",
    colors: {
      primary:    "#3D9E8C",   /* calm teal — healing, balance */
      background: "#0A0C0B",   /* deep dark green-black */
      text:       "#F0EDE6",   /* warm off-white */
      muted:      "#7A9690",   /* muted sage */
      surface:    "#111814",   /* dark surface */
    },
    fonts: {
      display:  "Bebas Neue",
      serif:    "Playfair Display",
      sans:     "DM Sans",
      mono:     "DM Mono",
      grotesk:  "Space Grotesk",
    },
  },

  /* ── Derived system prompt — built once, reused everywhere ─ */
  getSystemPrompt() {
    return `You are a social media content writer for ${this.brand_name}, ${this.business_description}

BRAND VOICE: ${this.brand_voice}
TONE: ${this.personal_touch}
AUDIENCE: ${this.target_demographics} — ${this.target_audience}
PAIN POINTS: ${this.audience_pain_points}
AUDIENCE GOALS: ${this.audience_objectives}
CORE VALUES: ${this.core_values}
PRODUCTS: ${this.products_services}
NICHE: ${this.brand_niche}
PERSONALITY: ${this.brand_personality}
COMPETITIVE EDGE: ${this.competitive_advantage}

CONTENT RULES:
- Write as ${this.brand_name}, not as generic social media copy
- Match the tone: ${this.personal_touch}
- Every piece of content must feel relevant to wellness, mindfulness or spirituality
- Speak directly to the audience pain points: ${this.audience_pain_points}
- Keep language accessible — no jargon, no preaching
- When citing stats or facts, keep them credible and wellness-relevant
- Return ONLY valid JSON — no markdown, no explanation, no extra text`;
  },
};

window.BrandContext = BrandContext;
