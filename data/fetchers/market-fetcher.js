/**
 * fetchers/market-fetcher.js
 * Fetches live intraday data from Yahoo Finance.
 * Returns raw data in market::day_chart shape.
 * Mappers.map() passes it straight through.
 */

const MARKET_SYMBOLS = {
  'NIFTY50':   '^NSEI',
  'SENSEX':    '^BSESN',
  'BANKNIFTY': '^NSEBANK',
  'NASDAQ':    '^IXIC',
  'SP500':     '^GSPC',
  'DOWJONES':  '^DJI',
};

const CORS_PROXY = 'https://corsproxy.io/?';

function _formatIndian(num) {
  if (!num && num !== 0) return '—';
  return Number(num).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function _formatDate(ts) {
  const d = ts ? new Date(ts * 1000) : new Date();
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function _formatTime(ts) {
  const d = new Date(ts * 1000);
  const h = d.getHours(), m = d.getMinutes();
  return h + (m > 0 ? ':' + String(m).padStart(2,'0') : ':00');
}
function _normalise(closes, timestamps) {
  const valid = closes.map((v,i) => ({v, ts:timestamps[i]})).filter(p => p.v != null);
  if (!valid.length) return [];
  const min = Math.min(...valid.map(p=>p.v));
  const max = Math.max(...valid.map(p=>p.v));
  const range = max - min || 1;
  return valid.map(p => ({ label:_formatTime(p.ts), value:Math.round(((p.v-min)/range)*100), raw:p.v }));
}
function _summary(market, direction, pct, pts, price) {
  const abs = Math.abs(pts).toFixed(2), absp = Math.abs(pct).toFixed(2);
  if (direction === 'up') {
    const s = pct > 1.5 ? 'strong' : pct > 0.5 ? 'steady' : 'modest';
    return `${market} closed with ${s} gains of ${absp}%, adding ${abs} points to close at ${Number(price).toFixed(2)}.`;
  }
  const s = pct < -1.5 ? 'sharp' : pct < -0.5 ? 'moderate' : 'slight';
  return `${market} ended lower with ${s} losses of ${absp}%, shedding ${abs} points to close at ${Number(price).toFixed(2)}.`;
}

async function fetchRaw(marketKey = 'NIFTY50') {
  const symbol = MARKET_SYMBOLS[marketKey] ?? marketKey;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=1d&includePrePost=false`;
  let json;
  try {
    const res = await fetch(url, { headers:{ 'Accept':'application/json' } });
    if (!res.ok) throw new Error('direct');
    json = await res.json();
  } catch {
    const res = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error('Proxy HTTP ' + res.status);
    json = await res.json();
  }
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No data for ' + symbol);
  const meta = result.meta;
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const closes = quote.close ?? [], highs = quote.high ?? [], lows = quote.low ?? [];
  const cur  = meta.regularMarketPrice ?? 0;
  const prev = meta.chartPreviousClose ?? cur;
  const high = meta.regularMarketDayHigh ?? Math.max(...highs.filter(Boolean));
  const low  = meta.regularMarketDayLow  ?? Math.min(...lows.filter(Boolean));
  const open = meta.regularMarketOpen    ?? closes[0] ?? cur;
  const chg  = cur - prev;
  const pct  = prev ? (chg / prev) * 100 : 0;
  const dir  = chg >= 0 ? 'up' : 'down';
  const sign = chg >= 0 ? '+' : '';
  const name = marketKey === 'NIFTY50' ? 'NIFTY 50' : (meta.shortName ?? marketKey);
  return {
    market_name: name,
    close_value: _formatIndian(cur),
    change_pct:  sign + pct.toFixed(2) + '%',
    change_pts:  sign + _formatIndian(chg),
    direction:   dir,
    high:        _formatIndian(high),
    low:         _formatIndian(low),
    open:        _formatIndian(open),
    date:        _formatDate(meta.regularMarketTime),
    source:      'Yahoo Finance · Live',
    summary:     _summary(name, dir, pct, chg, cur),
    chart_items: _normalise(closes, timestamps),
  };
}

function getDirectionColor(direction) { return direction === 'up' ? '#22C55E' : '#EF4444'; }

function patchSchemaColor(schema, direction) {
  const color = getDirectionColor(direction);
  const p = JSON.parse(JSON.stringify(schema));
  p.brand.colors.primary = color;
  p.brand.colors.accent  = color;
  return p;
}

window.MarketFetcher = { fetchRaw, getDirectionColor, patchSchemaColor, MARKET_SYMBOLS };
