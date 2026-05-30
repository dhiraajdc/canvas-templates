/**
 * market-data-fetcher.js
 * Fetches live NIFTY 50 intraday data from Yahoo Finance
 * and maps it to the market-day-chart template schema shape.
 *
 * Usage:
 *   const data = await fetchMarketData('NIFTY50');
 *   player.updateData(data);
 *
 * Supports: NIFTY50, SENSEX, BANKNIFTY, or any Yahoo Finance symbol
 */

/* ── Symbol map ─────────────────────────────────────────────────
   Maps friendly names to Yahoo Finance ticker symbols
──────────────────────────────────────────────────────────────── */
const SYMBOLS = {
  'NIFTY50':   '^NSEI',
  'SENSEX':    '^BSESN',
  'BANKNIFTY': '^NSEBANK',
  'NASDAQ':    '^IXIC',
  'SP500':     '^GSPC',
  'DOWJONES':  '^DJI',
};

/* ── CORS proxy ─────────────────────────────────────────────────
   Yahoo Finance blocks direct browser fetches.
   We use a lightweight public CORS proxy.
   For production replace with your own Cloudflare Worker.
──────────────────────────────────────────────────────────────── */
const CORS_PROXY = 'https://corsproxy.io/?';

/* ── Helpers ────────────────────────────────────────────────────*/
function formatIndian(num) {
  if (!num && num !== 0) return '—';
  return Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(ts) {
  const d = ts ? new Date(ts * 1000) : new Date();
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function formatTime(ts) {
  const d = new Date(ts * 1000);
  const h = d.getHours();
  const m = d.getMinutes();
  return h + (m > 0 ? ':' + String(m).padStart(2,'0') : ':00');
}

/* ── Normalise chart points ─────────────────────────────────────
   Converts raw close prices to 0–100 scale for the line_chart
   primitive. The primitive handles its own visual scaling, but
   keeping values relative makes the chart shape accurate.
──────────────────────────────────────────────────────────────── */
function normalisePoints(closes, timestamps) {
  const valid = closes
    .map((v, i) => ({ v, ts: timestamps[i] }))
    .filter(p => p.v !== null && p.v !== undefined);

  if (valid.length === 0) return [];

  const min = Math.min(...valid.map(p => p.v));
  const max = Math.max(...valid.map(p => p.v));
  const range = max - min || 1;

  return valid.map(p => ({
    label: formatTime(p.ts),
    value: Math.round(((p.v - min) / range) * 100),
    raw:   p.v
  }));
}

/* ── Main fetch function ────────────────────────────────────────*/
async function fetchMarketData(marketKey = 'NIFTY50') {
  const symbol = SYMBOLS[marketKey] ?? marketKey;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=1d&includePrePost=false`;

  let json;
  try {
    /* Try direct fetch first — works if CORS allows */
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('direct_failed');
    json = await res.json();
  } catch {
    /* Fall back to CORS proxy */
    try {
      const res = await fetch(CORS_PROXY + encodeURIComponent(url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
    } catch(e) {
      throw new Error('Could not fetch market data: ' + e.message);
    }
  }

  /* ── Parse response ─────────────────────────────────────────*/
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No data returned for ' + symbol);

  const meta       = result.meta;
  const timestamps = result.timestamp ?? [];
  const quote      = result.indicators?.quote?.[0] ?? {};
  const closes     = quote.close  ?? [];
  const highs      = quote.high   ?? [];
  const lows       = quote.low    ?? [];

  const currentPrice  = meta.regularMarketPrice        ?? meta.chartPreviousClose ?? 0;
  const previousClose = meta.chartPreviousClose         ?? meta.previousClose     ?? currentPrice;
  const dayHigh       = meta.regularMarketDayHigh       ?? Math.max(...highs.filter(Boolean));
  const dayLow        = meta.regularMarketDayLow        ?? Math.min(...lows.filter(Boolean));
  const openPrice     = meta.regularMarketOpen          ?? closes[0]              ?? currentPrice;

  const changeAbs = currentPrice - previousClose;
  const changePct = previousClose ? (changeAbs / previousClose) * 100 : 0;
  const direction = changeAbs >= 0 ? 'up' : 'down';
  const sign      = changeAbs >= 0 ? '+' : '';

  const chartItems = normalisePoints(closes, timestamps);

  /* ── Return data object matching template schema ────────────*/
  return {
    market_name:  marketKey === 'NIFTY50' ? 'NIFTY 50' : (meta.shortName ?? marketKey),
    close_value:  formatIndian(currentPrice),
    change_pct:   sign + changePct.toFixed(2) + '%',
    change_pts:   sign + formatIndian(changeAbs),
    direction,
    high:         formatIndian(dayHigh),
    low:          formatIndian(dayLow),
    open:         formatIndian(openPrice),
    date:         formatDate(meta.regularMarketTime),
    source:       'Yahoo Finance · Live',
    summary:      buildSummary(marketKey, direction, changePct, changeAbs, currentPrice),
    chart_items:  chartItems
  };
}

/* ── Auto-generate a text summary ───────────────────────────────
   Builds a short one-sentence summary from the live numbers.
   Replace with your own AI-generated copy when ready.
──────────────────────────────────────────────────────────────── */
function buildSummary(market, direction, pct, pts, price) {
  const abs  = Math.abs(pts).toFixed(2);
  const absp = Math.abs(pct).toFixed(2);

  if (direction === 'up') {
    const strength = pct > 1.5 ? 'strong' : pct > 0.5 ? 'steady' : 'modest';
    return `${market} closed with ${strength} gains of ${absp}%, adding ${abs} points to close at ${Number(price).toFixed(2)}.`;
  } else {
    const strength = pct < -1.5 ? 'sharp' : pct < -0.5 ? 'moderate' : 'slight';
    return `${market} ended lower with ${strength} losses of ${absp}%, shedding ${abs} points to close at ${Number(price).toFixed(2)}.`;
  }
}

/* ── Colour helper for up/down templates ────────────────────────
   Returns the right primary colour based on market direction.
   Patch this into the schema before loading.
──────────────────────────────────────────────────────────────── */
function getDirectionColor(direction) {
  return direction === 'up' ? '#22C55E' : '#EF4444';
}

/* ── Patch schema with live colour ─────────────────────────────
   Call this after fetchMarketData() to update the template
   accent colour to match the day direction.
──────────────────────────────────────────────────────────────── */
function patchSchemaColor(schema, direction) {
  const color = getDirectionColor(direction);
  const patched = JSON.parse(JSON.stringify(schema)); /* deep clone */
  patched.brand.colors.primary = color;
  patched.brand.colors.accent  = color;
  return patched;
}

/* ── Export ─────────────────────────────────────────────────────*/
window.MarketFetcher = {
  fetchMarketData,
  patchSchemaColor,
  getDirectionColor,
  SYMBOLS
};
