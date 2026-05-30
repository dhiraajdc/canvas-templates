/**
 * field-schemas.js
 * Defines the exact data contract for every intent::mode.
 * Used by:
 *   - Mappers to validate output before passing to player
 *   - AI generator (later) to know what fields to produce
 *   - Forms (later) to know what inputs to render
 *
 * Each schema entry:
 *   type     — 'string' | 'number' | 'array'
 *   required — must be present and non-empty
 *   max      — max character length (strings) or item count (arrays)
 *   hint     — description for AI / form labels
 *   example  — a concrete example value
 */

const FIELD_SCHEMAS = {

  /* ── Did You Know ─────────────────────────────────────────── */
  'dyk::stat': {
    stat_value: { type:'string',  required:true,  max:6,   hint:'The number — integer, decimal, or Nx', example:'73' },
    stat_unit:  { type:'string',  required:false, max:4,   hint:'Unit symbol or empty string',          example:'%' },
    stat_desc:  { type:'string',  required:true,  max:80,  hint:'One sentence — what the number means', example:'of remote workers report higher productivity at home' },
    source:     { type:'string',  required:true,  max:40,  hint:'Citation',                             example:'Stanford Research 2024' },
  },

  'dyk::ratio': {
    ratio_numerator:   { type:'string', required:true,  max:4,  hint:'The numerator — almost always 1',  example:'1' },
    ratio_denominator: { type:'string', required:true,  max:4,  hint:'The denominator',                  example:'5' },
    ratio_desc:        { type:'string', required:true,  max:80, hint:'What the ratio describes',          example:'adults experience a mental health condition each year' },
    source:            { type:'string', required:true,  max:40, hint:'Citation',                          example:'WHO 2024' },
  },

  'dyk::timeframe': {
    time_value:  { type:'string', required:true,  max:6,  hint:'The time quantity',         example:'60' },
    time_unit:   { type:'string', required:true,  max:12, hint:'The time label',            example:'seconds' },
    event_value: { type:'string', required:true,  max:8,  hint:'Quantity of event',         example:'500' },
    event_unit:  { type:'string', required:true,  max:12, hint:'Unit of event quantity',    example:'hours' },
    event_desc:  { type:'string', required:true,  max:60, hint:'What the event is',         example:'of video are uploaded to YouTube' },
    source:      { type:'string', required:true,  max:40, hint:'Citation',                  example:'YouTube 2024' },
  },

  /* ── Quote ────────────────────────────────────────────────── */
  'quote::portrait': {
    quote_text:   { type:'string', required:true,  max:120, hint:'The full quote',                example:'Stay hungry. Stay foolish.' },
    author_name:  { type:'string', required:true,  max:40,  hint:'Full name of the author',       example:'Steve Jobs' },
    author_image: { type:'string', required:true,  max:200, hint:'CORS-safe image URL',           example:'https://picsum.photos/id/1/400/400' },
    source:       { type:'string', required:false, max:60,  hint:'Book, speech, or year',         example:'Stanford Commencement, 2005' },
  },

  'quote::topic': {
    quote_text:  { type:'string', required:true,  max:120, hint:'The full quote',           example:'Culture eats strategy for breakfast.' },
    author_name: { type:'string', required:true,  max:40,  hint:'Full name of the author',  example:'Peter Drucker' },
    topic:       { type:'string', required:true,  max:20,  hint:'Subject label — one word', example:'Leadership' },
    source:      { type:'string', required:false, max:60,  hint:'Book, speech, or year',    example:'Management Challenges, 1999' },
  },

  'quote::split': {
    quote_hook:  { type:'string', required:true,  max:60,  hint:'Short punchy opener — one sentence max', example:'First they ignore you.' },
    quote_body:  { type:'string', required:true,  max:160, hint:'The rest of the quote',                  example:'Then they laugh at you. Then they fight you. Then you win.' },
    author_name: { type:'string', required:true,  max:40,  hint:'Full name of the author',                example:'Mahatma Gandhi' },
    source:      { type:'string', required:false, max:60,  hint:'Book, speech, or year',                  example:'Trade Union Speech, 1918' },
  },

  /* ── Tip ──────────────────────────────────────────────────── */
  'tip::checklist': {
    tip_headline: { type:'string', required:true, max:60, hint:'The overarching tip or prompt', example:'Before every important meeting' },
    item_1:       { type:'string', required:true, max:60, hint:'First checklist item',          example:'Write down the one outcome you need' },
    item_2:       { type:'string', required:true, max:60, hint:'Second checklist item',         example:'Prepare your first question in advance' },
    item_3:       { type:'string', required:true, max:60, hint:'Third checklist item',          example:'Arrive 2 minutes early and breathe' },
  },

  'tip::do_dont': {
    tip_headline: { type:'string', required:true, max:60, hint:'The context or subject',     example:'Writing a cold email' },
    do_text:      { type:'string', required:true, max:80, hint:'The recommended action',     example:'Lead with what is in it for them' },
    dont_text:    { type:'string', required:true, max:80, hint:'What to avoid',              example:'Lead with who you are and your credentials' },
    category:     { type:'string', required:true, max:20, hint:'Subject area label',         example:'Communication' },
  },

  'tip::stat_tip': {
    tip_headline: { type:'string', required:true,  max:60, hint:'The tip — main actionable advice',        example:'Take more breaks while working' },
    tip_body:     { type:'string', required:true,  max:120, hint:'One to two sentences supporting the tip', example:'Short breaks restore focus and prevent decision fatigue.' },
    stat_value:   { type:'string', required:true,  max:6,  hint:'The supporting number',                   example:'52' },
    stat_unit:    { type:'string', required:true,  max:6,  hint:'Unit of the number',                      example:'min' },
  },

  /* ── Fun Fact ─────────────────────────────────────────────── */
  'funfact::versus': {
    item_a:   { type:'string', required:true,  max:40, hint:'First item — short label',                    example:'A day on Venus' },
    item_b:   { type:'string', required:true,  max:40, hint:'Second item — short label',                   example:'A year on Venus' },
    context:  { type:'string', required:true,  max:120, hint:'One sentence explaining the contrast',       example:'A day on Venus is actually longer than its entire year around the Sun' },
    category: { type:'string', required:true,  max:20, hint:'Subject label',                               example:'Space' },
  },

  'funfact::number_fact': {
    fact_number: { type:'string', required:true,  max:8,   hint:'The surprising number',            example:'10' },
    fact_unit:   { type:'string', required:false, max:8,   hint:'Unit or empty string',             example:'M' },
    fact_label:  { type:'string', required:true,  max:100, hint:'What the number describes',        example:'bacteria live on every square centimetre of your skin' },
    category:    { type:'string', required:true,  max:20,  hint:'Subject label',                    example:'Biology' },
  },

  'funfact::mind_blown': {
    setup:    { type:'string', required:true,  max:80,  hint:'The surprising claim — bold, declarative', example:'Oxford University is older than the Aztec Empire' },
    twist:    { type:'string', required:true,  max:160, hint:'The proof — one to two sentences',         example:'Teaching began at Oxford in 1096. The Aztec Empire was not founded until 1428.' },
    category: { type:'string', required:true,  max:20,  hint:'Subject label',                           example:'History' },
    source:   { type:'string', required:false, max:60,  hint:'Optional attribution',                    example:'Encyclopaedia Britannica' },
  },

  /* ── Market ───────────────────────────────────────────────── */
  'market::day_chart': {
    market_name:  { type:'string', required:true,  max:20,  hint:'Index or ticker name',         example:'NIFTY 50' },
    close_value:  { type:'string', required:true,  max:20,  hint:'Closing price formatted',      example:'22,419.95' },
    change_pct:   { type:'string', required:true,  max:10,  hint:'Percentage change with sign',  example:'+1.24%' },
    change_pts:   { type:'string', required:true,  max:12,  hint:'Point change with sign',       example:'+274.30' },
    direction:    { type:'string', required:true,  max:4,   hint:'up or down',                   example:'up' },
    high:         { type:'string', required:true,  max:20,  hint:'Day high formatted',           example:'22,526' },
    low:          { type:'string', required:true,  max:20,  hint:'Day low formatted',            example:'22,198' },
    open:         { type:'string', required:true,  max:20,  hint:'Open price formatted',         example:'22,201' },
    date:         { type:'string', required:true,  max:20,  hint:'Display date',                 example:'May 30, 2026' },
    source:       { type:'string', required:true,  max:40,  hint:'Data source',                  example:'NSE India 2026' },
    summary:      { type:'string', required:true,  max:160, hint:'One sentence summary',         example:'IT stocks led broad-based gains.' },
    chart_items:  { type:'array',  required:true,  max:12,  hint:'Array of {label, value} for line chart', example:[{label:'9:15',value:18}] },
  },

  /* ── News ─────────────────────────────────────────────────── */
  'news::headline': {
    headline:    { type:'string', required:true,  max:120, hint:'Article headline',              example:'OpenAI releases GPT-5 with real-time voice and vision' },
    summary:     { type:'string', required:true,  max:200, hint:'Short article summary',         example:'The latest model surpasses human expert performance on benchmarks.' },
    category:    { type:'string', required:false, max:30,  hint:'News category',                 example:'Technology' },
    source_name: { type:'string', required:true,  max:40,  hint:'Publisher name',               example:'BBC News' },
    published:   { type:'string', required:true,  max:20,  hint:'Publication date',             example:'30 May 2026' },
    image_url:   { type:'string', required:false, max:300, hint:'Article image URL (CORS-safe)', example:'https://ichef.bbci.co.uk/news/...' },
    article_url: { type:'string', required:false, max:300, hint:'Full article URL',             example:'https://bbc.com/news/...' },
  },

};

/* ── Validator ──────────────────────────────────────────────────
   Call before passing data to the player.
   Returns { valid: true } or { valid: false, errors: [...] }
──────────────────────────────────────────────────────────────── */
function validateData(intentMode, data) {
  const schema = FIELD_SCHEMAS[intentMode];
  if (!schema) return { valid: true }; /* unknown mode — pass through */

  const errors = [];
  for (const [field, rules] of Object.entries(schema)) {
    const val = data[field];
    if (rules.required && (val === undefined || val === null || val === '')) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }
    if (val === undefined || val === null) continue;
    if (rules.type === 'string' && rules.max && String(val).length > rules.max) {
      errors.push(`Field "${field}" exceeds max length ${rules.max}: "${String(val).slice(0,20)}..."`);
    }
    if (rules.type === 'array' && rules.max && Array.isArray(val) && val.length > rules.max) {
      errors.push(`Field "${field}" has too many items (max ${rules.max}, got ${val.length})`);
    }
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

window.FieldSchemas = { FIELD_SCHEMAS, validateData };
