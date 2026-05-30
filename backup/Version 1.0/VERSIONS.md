# AIFeed Version History

## v1.0 — 2026-05-30
**File:** AIFeed_v1.0.html (1311 lines)  
**Status:** STABLE ✓

### Features
- Empty state + feed layout
- GitHub template fetcher (index.json + FILE_MAP fallback)
- Full pipeline: dummy / AI / market / news sources
- Brand injection (`injectBrand`) from `brand-context.js`
- AI format picker — detects market/news keywords, else AI picks from 12 formats
- 3-step loader (Picking format → Generating → Building)
- Topic sheet with AI prefetch, shimmer, cache, refresh
- Gear icon + API key settings
- Edit modal with field schemas, image picker, char counts, validation
- Play / pause / delete on each card
- Topic label on card header
- Generate bar with prefs icon left of Generate button
- Content preferences sheet — AI toggle + intent/mode selector, localStorage
- Market + news live fetchers with dummy fallback

### Required files
```
AIFeed.html
player-lite.js
data/
  brand-context.js
  ai-client.js
  content-generator.js
  field-schemas.js
  mappers.js
  pipeline.js
  fetchers/
    dummy-fetcher.js
    market-fetcher.js
    news-fetcher.js
```
