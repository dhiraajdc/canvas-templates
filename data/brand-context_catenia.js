/**
 * brand-context.js — Cateina Technologies
 * Generated from cateina.com + brand profile screenshots
 * Replace data/brand-context.js with this file to switch brands.
 */

const BrandContext = {

  /* ── Core identity ──────────────────────────────────────── */
  brand_name:           "Cateina Technologies",
  business_description: "A B2B technology company specialising in AI, APIs, blockchain, and cloud integration to deliver secure, scalable digital transformation solutions for financial services and enterprises.",
  industry:             "Technology and Digital Transformation",
  products_services:    "AI solutions, API management, blockchain integration, cloud services, digital wallets, smart contracts, open banking, corporate banking, insurance tech, data reconciliation, consent management, payments, digital identity",
  business_type:        "B2B",
  website:              "cateina.com",
  hashtags:             "#Cateina #DigitalTransformation #OpenBanking #FinTech #BlockChain #AI #Web3 #APIManagement",

  /* ── Audience ───────────────────────────────────────────── */
  target_audience:      "Financial institutions, insurance providers, digital commerce firms, and enterprises seeking digital innovation",
  target_demographics:  "Corporate clients — CTOs, product heads, and digital transformation leads at banks, fintechs, and large enterprises",
  audience_pain_points: "Legacy system inefficiencies, data security concerns, complex financial operations, lack of automation, and need for seamless digital integration",
  audience_objectives:  "Streamline operations, enhance data integrity, automate processes, and unlock new revenue opportunities",

  /* ── Voice & tone ───────────────────────────────────────── */
  brand_voice:          "Professional, innovative, tech-savvy, and supportive with a touch of playful confidence",
  personal_touch:       "Fun & Friendly with technical depth — approachable but expert",
  brand_niche:          "Enterprise digital transformation focusing on AI, Web 3.0, and cloud-driven finance and commerce solutions",
  brand_personality:    "Cutting-edge, reliable, innovative, approachable, and forward-thinking",

  /* ── Values & positioning ───────────────────────────────── */
  core_values:          "Innovation, security, scalability, customer-centricity, and empowering businesses through technology",
  unique_selling_point: "Innovative, secure, and scalable technology solutions that modernise legacy systems and enhance financial and operational efficiencies",
  competitive_advantage:"Combines AI, blockchain, and cloud expertise to offer flexible, user-centric digital solutions tailored to diverse industries — 70+ countries, 20K+ APIs delivered, 1M+ blockchain transactions",

  /* ── Brand visuals ──────────────────────────────────────────
     Primary color sourced from Cateina's brand — deep navy blue
  ──────────────────────────────────────────────────────────── */
  brand_visuals: {
    logo: "CATEINA",
    colors: {
      primary:    "#1B2CC1",   /* Cateina navy blue */
      background: "#080A14",   /* deep dark navy-black */
      text:       "#F0F2FA",   /* cool off-white */
      muted:      "#6B7299",   /* muted blue-grey */
      surface:    "#0F1225",   /* dark surface */
    },
    fonts: {
      display:  "Bebas Neue",
      serif:    "Playfair Display",
      sans:     "DM Sans",
      mono:     "DM Mono",
      grotesk:  "Space Grotesk",
    },
  },

  /* ── Derived system prompt ───────────────────────────────── */
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
- Content must be relevant to fintech, digital transformation, AI, or enterprise technology
- Speak directly to the audience pain points: ${this.audience_pain_points}
- Keep language accessible but technically credible — no empty buzzwords
- When citing stats or facts, keep them credible and fintech/tech-relevant
- Return ONLY valid JSON — no markdown, no explanation, no extra text`;
  },
};

window.BrandContext = BrandContext;
