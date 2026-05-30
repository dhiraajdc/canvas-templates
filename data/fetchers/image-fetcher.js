/**
 * image-fetcher.js
 * Fetches relevant images from Pexels API based on topic/query.
 * Optimised: session cache, small response, medium image size.
 */

const ImageFetcher = (() => {

  const PEXELS_BASE = 'https://api.pexels.com/v1';

  /* ── Session cache — avoids repeat API calls for same topic ── */
  const _cache = new Map();

  /* ── Curated picsum fallbacks by topic category ── */
  const FALLBACK_POOLS = {
    wellness:     [10, 11, 13, 15, 17, 43, 48, 65],
    productivity: [20, 24, 26, 28, 37, 42, 60, 62],
    mindfulness:  [10, 13, 15, 17, 43, 65, 96, 110],
    fitness:      [12, 16, 21, 29, 41, 57, 67, 82],
    nutrition:    [30, 32, 49, 56, 75, 139, 142, 180],
    business:     [24, 26, 28, 38, 42, 60, 62, 107],
    technology:   [0, 1, 2, 3, 4, 5, 6, 7],
    nature:       [10, 11, 13, 15, 17, 43, 48, 65],
    default:      [10, 11, 13, 15, 17, 20, 24, 26],
  };

  function getFallback(topic = '') {
    const t = topic.toLowerCase();
    for (const [cat, ids] of Object.entries(FALLBACK_POOLS)) {
      if (t.includes(cat)) {
        const id = ids[Math.floor(Math.random() * ids.length)];
        return `https://picsum.photos/id/${id}/1080/1350`;
      }
    }
    const ids = FALLBACK_POOLS.default;
    return `https://picsum.photos/id/${ids[Math.floor(Math.random() * ids.length)]}/1080/1350`;
  }

  /* ── Extract 2 keywords max — shorter query = faster API response ── */
  function buildQuery(topic) {
    const stop = new Set(['the','a','an','and','or','but','for','with','about','how','why','what','is','are','to','of','in','on','at','by']);
    const words = topic.toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w))
      .slice(0, 2); /* 2 keywords max — tighter query, faster results */
    return words.join(' ') || topic.split(' ')[0];
  }

  /* ── Main fetch ── */
  async function fetchImage(topic, { width = 1080, height = 1350 } = {}) {
    const key = getKey();
    if (!key) return getFallback(topic);

    const query       = buildQuery(topic);
    const cacheKey    = query;
    const orientation = width >= height ? 'landscape' : 'portrait';

    /* Return cached result instantly */
    if (_cache.has(cacheKey)) {
      return _cache.get(cacheKey);
    }

    try {
      const res = await fetch(
        /* per_page=3 — only need a few options, much smaller response */
        `${PEXELS_BASE}/search?query=${encodeURIComponent(query)}&per_page=3&orientation=${orientation}`,
        {
          headers: { Authorization: key },
          signal: AbortSignal.timeout(3000), /* 3s timeout, down from 4s */
        }
      );

      if (!res.ok) {
        console.warn('[ImageFetcher] Pexels error:', res.status);
        return getFallback(topic);
      }

      const data = await res.json();

      if (!data.photos?.length) {
        /* No results — use fallback, no second API call */
        return getFallback(topic);
      }

      /* Always use first result — most relevant match */
      const photo = data.photos[0];
      const url   = photo.src.large || photo.src.medium || photo.src.original;

      /* Cache for this session */
      _cache.set(cacheKey, url);

      return url;

    } catch(e) {
      console.warn('[ImageFetcher] Fetch failed:', e.message);
      return getFallback(topic);
    }
  }

  /* ── Fetch multiple images for image picker (carousel edit) ── */
  async function fetchMultiple(topic, count = 5) {
    const key = getKey();
    if (!key) {
      /* Return fallback picsum images */
      return Array.from({ length: count }, () => getFallback(topic));
    }
    const query       = buildQuery(topic);
    const orientation = 'portrait';
    try {
      const res = await fetch(
        `${PEXELS_BASE}/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=${orientation}`,
        { headers: { Authorization: key }, signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) return Array.from({ length: count }, () => getFallback(topic));
      const data = await res.json();
      if (!data.photos?.length) return Array.from({ length: count }, () => getFallback(topic));
      return data.photos.map(p => p.src.large || p.src.medium);
    } catch(e) {
      return Array.from({ length: count }, () => getFallback(topic));
    }
  }

  /* ── Prefetch for a topic — call early to warm cache ── */
  function prefetch(topic) {
    if (!getKey()) return;
    fetchImage(topic).catch(() => {});
  }

  /* ── Key management ── */
  function getKey()  { return localStorage.getItem('aifeed_pexels_key') ?? ''; }
  function setKey(k) { k ? localStorage.setItem('aifeed_pexels_key', k.trim()) : localStorage.removeItem('aifeed_pexels_key'); }
  function hasKey()  { return !!getKey(); }
  function clearCache() { _cache.clear(); }

  return { fetchImage, fetchMultiple, prefetch, getFallback, getKey, setKey, hasKey, buildQuery, clearCache };

})();

window.ImageFetcher = ImageFetcher;
