/**
 * pipeline.js  v2
 * Single entry point for all data fetching and template loading.
 *
 * Sources:
 *   dummy   — DummyFetcher: random pick from 3-sample pool per key
 *   manual  — user form input, passed straight through
 *   ai      — stub (throws), replace with AI call later
 *   market  — MarketFetcher: live Yahoo Finance data
 *   news    — NewsFetcher: live RSS data
 *
 * Usage:
 *   const data = await Pipeline.getData({ key: 'dyk::stat', source: 'dummy' });
 *   const data = await Pipeline.getData({ key: 'market::day_chart', source: 'market', input: { market: 'NIFTY50' } });
 *   const data = await Pipeline.getData({ key: 'news::headline', source: 'news', input: { feed: 'bbc_world' } });
 *
 *   await Pipeline.loadAndRender({ key, source, input, schema, player, isFirst: true });
 *
 * Adding AI later — just replace the ai source entry:
 *   ai: async (key, input) => await AIFetcher.fetchRaw(key, input)
 */

const Pipeline = (() => {

  /* ══════════════════════════════════════════════════════════════
     SOURCE REGISTRY
     Maps source name -> async function that returns raw data.
     Mappers handle the field translation from raw -> template shape.
  ══════════════════════════════════════════════════════════════*/
  const SOURCES = {

    /* ── dummy ─────────────────────────────────────────────────
       Random pick from 3-sample pool. Each generate feels fresh.
       Requires: dummy-fetcher.js loaded on page.
    ──────────────────────────────────────────────────────────── */
    dummy: async (key, _input) => {
      if (!window.DummyFetcher) throw new Error('DummyFetcher not loaded — add dummy-fetcher.js to page');
      return window.DummyFetcher.fetchRaw(key);
    },

    /* ── manual ────────────────────────────────────────────────
       User-provided form data. Input IS the data — no fetch.
    ──────────────────────────────────────────────────────────── */
    manual: async (_key, input) => input ?? {},

    /* ── ai ────────────────────────────────────────────────────
       Brand-aware content via Claude API.
       Requires: ai-client.js, brand-context.js, content-generator.js
       input: { topic: 'string' }
    ──────────────────────────────────────────────────────────── */
    ai: async (key, input) => {
      if (!window.ContentGenerator) throw new Error('ContentGenerator not loaded');
      if (!window.AIClient?.hasKey()) throw new Error('No API key — open Settings to add your Anthropic key');
      const topic = input?.topic ?? 'general wellness';
      return await window.ContentGenerator.generate({ key, topic });
    },

    /* ── market ────────────────────────────────────────────────
       Live NIFTY / market data via Yahoo Finance.
       Requires: fetchers/market-fetcher.js loaded on page.
       input: { market: 'NIFTY50' | 'SENSEX' | 'BANKNIFTY' | ... }
    ──────────────────────────────────────────────────────────── */
    market: async (_key, input) => {
      if (!window.MarketFetcher) throw new Error('MarketFetcher not loaded — add fetchers/market-fetcher.js to page');
      return await window.MarketFetcher.fetchRaw(input?.market ?? 'NIFTY50');
    },

    /* ── news ──────────────────────────────────────────────────
       Live RSS news articles. Random pick from top 5 with images.
       Requires: fetchers/news-fetcher.js loaded on page.
       input: { feed: 'bbc_world' | 'techcrunch' | 'wired' | ... }
    ──────────────────────────────────────────────────────────── */
    news: async (_key, input) => {
      if (!window.NewsFetcher) throw new Error('NewsFetcher not loaded — add fetchers/news-fetcher.js to page');
      return await window.NewsFetcher.fetchRaw(input?.feed ?? 'bbc_world');
    },

    /* ── Placeholder slots — add fetchers as you build them ────*/
    sports:  async (_key, _input) => { throw new Error('Sports fetcher not yet implemented'); },
    weather: async (_key, _input) => { throw new Error('Weather fetcher not yet implemented'); },
  };

  /* ══════════════════════════════════════════════════════════════
     getData  —  main public function
     Returns a clean data{} object ready to pass to the player.
  ══════════════════════════════════════════════════════════════*/
  async function getData({ key, source = 'dummy', input = {} }) {

    /* 1 — Validate source */
    if (!SOURCES[source]) {
      console.warn('[Pipeline] Unknown source "' + source + '" — falling back to dummy');
      source = 'dummy';
    }

    /* 2 — Fetch raw data */
    let raw = null;
    try {
      raw = await SOURCES[source](key, input);
    } catch(e) {
      console.warn('[Pipeline] Source "' + source + '" failed for "' + key + '":', e.message, '— falling back to dummy');
      try {
        raw = await SOURCES['dummy'](key, input);
        source = 'dummy';
      } catch(e2) {
        console.error('[Pipeline] Dummy fallback also failed:', e2.message);
      }
    }

    /* 3 — Map raw -> template data shape */
    if (!window.Mappers) throw new Error('Mappers not loaded — add mappers.js to page');
    /* Carousel AI returns array directly — skip mapper which only handles single objects */
    const data = (key && key.startsWith('carousel::') && Array.isArray(raw))
      ? raw
      : window.Mappers.map(key, source, raw ?? {});

    /* 4 — Validate against field schema (non-blocking, skip for carousel arrays) */
    if (window.FieldSchemas && !Array.isArray(data)) {
      const result = window.FieldSchemas.validateData(key, data);
      if (!result.valid) {
        console.warn('[Pipeline] Validation warnings for "' + key + '":', result.errors);
      }
    }

    return data;
  }

  /* ══════════════════════════════════════════════════════════════
     loadAndRender  —  convenience: getData + player in one call
  ══════════════════════════════════════════════════════════════*/
  async function loadAndRender({ key, source = 'dummy', input = {}, schema, player, isFirst = false }) {
    const isCarousel = key && key.startsWith('carousel::');

    /* Carousel + dummy — skip data fetch entirely, use template data array */
    if (isCarousel && source === 'dummy') {
      if (isFirst) {
        await player.load(schema); /* schema.data is already the full slides array */
      }
      return Array.isArray(schema.data) ? schema.data : [schema.data];
    }

    const data = await getData({ key, source, input });

    /* For market templates — patch accent colour based on direction */
    let finalSchema = schema;
    if (data.direction && window.MarketFetcher) {
      finalSchema = window.MarketFetcher.patchSchemaColor(schema, data.direction);
    }

    if (isFirst) {
      const patched = JSON.parse(JSON.stringify(finalSchema));
      /* Carousel + AI — data is already an array from content generator */
      if (isCarousel) {
        patched.data = Array.isArray(data) ? data : [data];
      } else {
        patched.data = data;
      }
      await player.load(patched);
    } else {
      player.updateData(data);
    }

    return data;
  }

  /* ── Helpers ─────────────────────────────────────────────────*/
  function listSources() { return Object.keys(SOURCES); }

  return { getData, loadAndRender, listSources };

})();

window.Pipeline = Pipeline;
