/**
 * mappers.js
 * One mapper per intent::mode.
 * Takes raw source data, returns exact data{} the template needs.
 *
 * Sources handled per mapper:
 *   dummy  — from DummyFetcher.fetchRaw() — random pool pick
 *   manual — user form input, pass straight through
 *   ai     — stub, returns dummy until AI is wired (same shape)
 *   news   — from NewsFetcher.fetchRaw()
 *   market — from MarketFetcher.fetchRaw()
 *
 * Mappers are pure functions — no fetching, no side effects.
 */

const MAP_FNS = {

  /* ── Did You Know ─────────────────────────────────────────── */

  'dyk::stat'(raw, source) {
    if (source === 'manual') return raw;
    /* dummy, ai — raw already in correct shape from DummyFetcher */
    return {
      stat_value: raw?.stat_value ?? '73',
      stat_unit:  raw?.stat_unit  ?? '%',
      stat_desc:  raw?.stat_desc  ?? 'of remote workers report higher productivity at home',
      source:     raw?.source     ?? 'Stanford Research 2024',
    };
  },

  'dyk::ratio'(raw, source) {
    if (source === 'manual') return raw;
    return {
      ratio_numerator:   raw?.ratio_numerator   ?? '1',
      ratio_denominator: raw?.ratio_denominator ?? '5',
      ratio_desc:        raw?.ratio_desc        ?? 'adults experience a mental health condition each year',
      source:            raw?.source            ?? 'WHO 2024',
    };
  },

  'dyk::timeframe'(raw, source) {
    if (source === 'manual') return raw;
    return {
      time_value:  raw?.time_value  ?? '60',
      time_unit:   raw?.time_unit   ?? 'seconds',
      event_value: raw?.event_value ?? '500',
      event_unit:  raw?.event_unit  ?? 'hours',
      event_desc:  raw?.event_desc  ?? 'of video are uploaded to YouTube',
      source:      raw?.source      ?? 'YouTube 2024',
    };
  },

  /* ── Quote ────────────────────────────────────────────────── */

  'quote::portrait'(raw, source) {
    if (source === 'manual') return raw;
    return {
      quote_text:   raw?.quote_text   ?? 'Stay hungry. Stay foolish.',
      author_name:  raw?.author_name  ?? 'Steve Jobs',
      author_image: raw?.author_image ?? 'https://picsum.photos/id/1/400/400',
      source:       raw?.source       ?? 'Stanford Commencement, 2005',
    };
  },

  'quote::topic'(raw, source) {
    if (source === 'manual') return raw;
    return {
      quote_text:  raw?.quote_text  ?? 'Culture eats strategy for breakfast.',
      author_name: raw?.author_name ?? 'Peter Drucker',
      topic:       raw?.topic       ?? 'Leadership',
      source:      raw?.source      ?? 'Management Challenges, 1999',
    };
  },

  'quote::split'(raw, source) {
    if (source === 'manual') return raw;
    return {
      quote_hook:  raw?.quote_hook  ?? 'First they ignore you.',
      quote_body:  raw?.quote_body  ?? 'Then they laugh at you. Then they fight you. Then you win.',
      author_name: raw?.author_name ?? 'Mahatma Gandhi',
      source:      raw?.source      ?? 'Trade Union Speech, 1918',
    };
  },

  /* ── Tip ──────────────────────────────────────────────────── */

  'tip::checklist'(raw, source) {
    if (source === 'manual') return raw;
    return {
      tip_headline: raw?.tip_headline ?? 'Before every important meeting',
      item_1:       raw?.item_1       ?? 'Write down the one outcome you need',
      item_2:       raw?.item_2       ?? 'Prepare your first question in advance',
      item_3:       raw?.item_3       ?? 'Arrive 2 minutes early and breathe',
    };
  },

  'tip::do_dont'(raw, source) {
    if (source === 'manual') return raw;
    return {
      tip_headline: raw?.tip_headline ?? 'Writing a cold email',
      do_text:      raw?.do_text      ?? 'Lead with what is in it for them',
      dont_text:    raw?.dont_text    ?? 'Lead with who you are and your credentials',
      category:     raw?.category     ?? 'Communication',
    };
  },

  'tip::stat_tip'(raw, source) {
    if (source === 'manual') return raw;
    return {
      tip_headline: raw?.tip_headline ?? 'Take more breaks while working',
      tip_body:     raw?.tip_body     ?? 'Short breaks restore focus and prevent decision fatigue throughout the day.',
      stat_value:   raw?.stat_value   ?? '52',
      stat_unit:    raw?.stat_unit    ?? 'min',
    };
  },

  /* ── Fun Fact ─────────────────────────────────────────────── */

  'funfact::versus'(raw, source) {
    if (source === 'manual') return raw;
    return {
      item_a:   raw?.item_a   ?? 'A day on Venus',
      item_b:   raw?.item_b   ?? 'A year on Venus',
      context:  raw?.context  ?? 'A day on Venus is actually longer than its entire year around the Sun',
      category: raw?.category ?? 'Space',
    };
  },

  'funfact::number_fact'(raw, source) {
    if (source === 'manual') return raw;
    return {
      fact_number: raw?.fact_number ?? '10',
      fact_unit:   raw?.fact_unit   ?? 'M',
      fact_label:  raw?.fact_label  ?? 'bacteria live on every square centimetre of your skin',
      category:    raw?.category    ?? 'Biology',
    };
  },

  'funfact::mind_blown'(raw, source) {
    if (source === 'manual') return raw;
    return {
      setup:    raw?.setup    ?? 'Oxford University is older than the Aztec Empire',
      twist:    raw?.twist    ?? 'Teaching began at Oxford in 1096. The Aztec Empire was not founded until 1428.',
      category: raw?.category ?? 'History',
      source:   raw?.source   ?? 'Encyclopaedia Britannica',
    };
  },

  /* ── Market ───────────────────────────────────────────────── */

  'market::day_chart'(raw, source) {
    if (source === 'manual') return raw;
    if (source === 'market') return raw; /* MarketFetcher already returns correct shape */
    /* dummy fallback */
    return {
      market_name:  raw?.market_name  ?? 'NIFTY 50',
      close_value:  raw?.close_value  ?? '22,419.95',
      change_pct:   raw?.change_pct   ?? '+1.24%',
      change_pts:   raw?.change_pts   ?? '+274.30',
      direction:    raw?.direction    ?? 'up',
      high:         raw?.high         ?? '22,526',
      low:          raw?.low          ?? '22,198',
      open:         raw?.open         ?? '22,201',
      date:         raw?.date         ?? 'May 30, 2026',
      source:       raw?.source       ?? 'NSE India 2026',
      summary:      raw?.summary      ?? 'IT and banking stocks led broad-based gains as foreign inflows strengthened the rupee.',
      chart_items:  raw?.chart_items  ?? [
        {label:'9:15',value:18},{label:'10:00',value:32},{label:'11:00',value:25},
        {label:'12:00',value:48},{label:'13:00',value:41},{label:'14:00',value:62},
        {label:'15:00',value:55},{label:'15:30',value:71}
      ],
    };
  },

  /* ── News ─────────────────────────────────────────────────── */

  'news::headline'(raw, source) {
    if (source === 'manual') return raw;
    if (source === 'news') {
      /* NewsFetcher returns correct shape — map with safe fallbacks */
      return {
        headline:    raw?.headline    ?? 'Breaking news headline',
        summary:     raw?.summary     ?? 'Summary of the news article.',
        category:    raw?.category    ?? 'News',
        source_name: raw?.source_name ?? 'Reuters',
        published:   raw?.published   ?? new Date().toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}),
        image_url:   raw?.image_url   ?? 'https://picsum.photos/id/10/1080/1350',
        article_url: raw?.article_url ?? '',
      };
    }
    /* dummy */
    return {
      headline:    raw?.headline    ?? 'India launches its largest solar power plant in Rajasthan desert',
      summary:     raw?.summary     ?? 'The 2,400 MW facility is now operational, powering over 1.5 million homes across the region.',
      category:    raw?.category    ?? 'Energy',
      source_name: raw?.source_name ?? 'The Hindu',
      published:   raw?.published   ?? 'May 30, 2026',
      image_url:   raw?.image_url   ?? 'https://picsum.photos/id/10/1080/1350',
      article_url: raw?.article_url ?? '',
    };
  },

  /* ── Editorial ────────────────────────────────────────────── */

  'editorial::cover'(raw, source) {
    if (source === 'manual') return raw;
    return {
      title:       raw?.title       ?? 'The Future of Open Banking',
      description: raw?.description ?? 'How APIs are reshaping financial services globally.',
      category:    raw?.category    ?? 'Technology',
      image_url:   raw?.image_url   ?? 'https://picsum.photos/id/10/1080/1350',
      source:      raw?.source      ?? 'Insights',
    };
  },


};

/* ══════════════════════════════════════════════════════════════
   PUBLIC map() — the only function callers use
══════════════════════════════════════════════════════════════*/
function map(intentMode, source, rawData = {}) {
  const fn = MAP_FNS[intentMode];
  if (!fn) {
    console.warn('[Mappers] No mapper for "' + intentMode + '" — returning raw data');
    return rawData;
  }
  return fn(rawData ?? {}, source);
}

window.Mappers = { map, MAP_FNS };
