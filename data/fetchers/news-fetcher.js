/**
 * fetchers/news-fetcher.js
 * Fetches top headlines from RSS feeds.
 * Tries multiple image extraction strategies per item.
 * Returns top 5 articles — caller picks one randomly.
 *
 * Sources (no API key needed):
 *   BBC World  — reliable images via media:thumbnail
 *   Reuters    — images via media:content
 *   The Hindu  — good India coverage
 *   Google News — fallback, images inside description HTML
 */

const NEWS_CORS_PROXY = 'https://corsproxy.io/?';

/* ── Feed registry ─────────────────────────────────────────────
   Add any RSS feed URL here. The fetcher handles all of them
   the same way — it tries every image extraction method.
──────────────────────────────────────────────────────────────── */
const RSS_FEEDS = {
  /* Confirmed working 2026 */
  'bbc':        'https://feeds.bbci.co.uk/news/rss.xml',
  'bbc_world':  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'bbc_tech':   'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'techcrunch': 'https://techcrunch.com/feed/',
  'wired':      'https://www.wired.com/feed/rss',
  'aljazeera':  'https://www.aljazeera.com/xml/rss/all.xml',
  'aljtech':    'https://www.aljazeera.com/xml/rss/all.xml',
  'verge':      'https://www.theverge.com/rss/index.xml',
  'guardian':   'https://www.theguardian.com/world/rss',
  'nytimes':    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  /* Reuters removed direct RSS in 2020 — use Google News proxy instead */
  'reuters':    'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&hl=en&gl=US&ceid=US:en',
  /* Google News top headlines */
  'google':     'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en',
  'google_tech':'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlBQVAB?hl=en-IN&gl=IN&ceid=IN:en',
};

/* Default feed to use */
const DEFAULT_FEED = 'bbc_world';

/* ── Image extraction strategies ───────────────────────────────
   Different RSS feeds put images in different places.
   We try all of these in order until we find one.
──────────────────────────────────────────────────────────────── */
function extractImage(item, rawXml) {
  /* Strategy 1: media:content url attribute */
  const mediaContent = item.querySelector('content');
  if (mediaContent?.getAttribute('url')) return mediaContent.getAttribute('url');

  /* Strategy 2: media:thumbnail url attribute */
  const mediaThumbnail = item.querySelector('thumbnail');
  if (mediaThumbnail?.getAttribute('url')) return mediaThumbnail.getAttribute('url');

  /* Strategy 3: enclosure url attribute (RSS 2.0 standard) */
  const enclosure = item.querySelector('enclosure');
  if (enclosure?.getAttribute('url') && enclosure.getAttribute('type')?.startsWith('image')) {
    return enclosure.getAttribute('url');
  }

  /* Strategy 4: <image> tag directly in item */
  const imageTag = item.querySelector('image');
  if (imageTag?.textContent?.trim()) return imageTag.textContent.trim();

  /* Strategy 5: <img> tag inside description HTML */
  const desc = item.querySelector('description')?.textContent ?? '';
  const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) return imgMatch[1];

  /* Strategy 6: First URL in description that looks like an image */
  const urlMatch = desc.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp)/i);
  if (urlMatch?.[0]) return urlMatch[0];

  return null; /* No image found */
}

/* ── Category extraction ────────────────────────────────────── */
function extractCategory(item) {
  /* Try <category> tag first */
  const cat = item.querySelector('category')?.textContent?.trim();
  if (cat && cat.length < 30) return cat;

  /* Try <dc:subject> */
  const subj = item.querySelector('subject')?.textContent?.trim();
  if (subj) return subj;

  return 'News'; /* Default */
}

/* ── Date formatting ────────────────────────────────────────── */
function formatPubDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  } catch {
    return dateStr;
  }
}

/* ── Clean text ─────────────────────────────────────────────── */
function cleanText(str) {
  if (!str) return '';
  /* Strip HTML tags */
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').trim();
}

/* ── Main fetch function ─────────────────────────────────────── */
async function fetchRaw(feedKey = DEFAULT_FEED, options = {}) {
  const feedUrl = RSS_FEEDS[feedKey] ?? feedKey; /* allow raw URL too */
  const proxyUrl = NEWS_CORS_PROXY + encodeURIComponent(feedUrl);

  let xmlText;
  try {
    /* Try direct first */
    const res = await fetch(feedUrl, { headers:{ 'Accept':'application/rss+xml, application/xml, text/xml' } });
    if (!res.ok) throw new Error('direct failed');
    xmlText = await res.text();
  } catch {
    /* Fall back to CORS proxy */
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    xmlText = await res.text();
  }

  /* Parse XML */
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlText, 'application/xml');
  const items  = Array.from(doc.querySelectorAll('item')).slice(0, 10);

  if (items.length === 0) throw new Error('No items in RSS feed');

  /* Map items to article objects */
  const articles = items.map(item => {
    const title   = cleanText(item.querySelector('title')?.textContent);
    const desc    = cleanText(item.querySelector('description')?.textContent);
    const link    = item.querySelector('link')?.textContent?.trim()
                 ?? item.querySelector('guid')?.textContent?.trim()
                 ?? '';
    const source  = cleanText(
      item.querySelector('source')?.textContent
      ?? doc.querySelector('channel > title')?.textContent
      ?? feedKey
    );
    const pubDate = item.querySelector('pubDate')?.textContent
                 ?? item.querySelector('date')?.textContent
                 ?? '';
    const image   = extractImage(item, xmlText);
    const category = extractCategory(item);

    return { title, desc, link, source, pubDate: formatPubDate(pubDate), image, category };
  });

  /* Filter to articles that have an image — news template requires one */
  const withImages = articles.filter(a => a.image);

  /* Pick from top 5 with images; fall back to top 5 without if none found */
  const pool = (withImages.length >= 3 ? withImages : articles).slice(0, 5);
  if (pool.length === 0) throw new Error('No usable articles found');

  /* Random pick from pool */
  const pick = pool[Math.floor(Math.random() * pool.length)];

  /* Return in news::headline mapper shape */
  return {
    headline:    pick.title,
    summary:     pick.desc.slice(0, 200), /* cap at 200 chars */
    category:    pick.category,
    source_name: pick.source,
    published:   pick.pubDate,
    image_url:   pick.image ?? '',
    article_url: pick.link,
    _pool_size:  pool.length,   /* debug info */
    _has_image:  !!pick.image,
  };
}

/* ── List available feeds ──────────────────────────────────── */
function listFeeds() { return Object.keys(RSS_FEEDS); }

window.NewsFetcher = { fetchRaw, listFeeds, RSS_FEEDS };
