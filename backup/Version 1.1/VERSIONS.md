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

## v1.1 — 2026-05-30
**File:** AIFeed_v1.1.html (1665 lines)
**Status:** STABLE ✓

### New in v1.1
- 3 generation modes: Full Auto / AI with Topic / Manual
- AI topic picker (pickTopic) with recent topic history
- Weighted algo format picker — replaced AI call, instant
- Content preferences sheet with intent/mode selector
- Split button UI (gear + Generate Post)
- Editorial::cover template (LinkedIn full-bleed)
- Carousel templates: listicle, story_arc, step_by_step, comparison
- Carousel AI content generation (array of slides)
- Carousel edit modal — tabbed UI, per-slide editing, shared image + category
- Market + news dummy fallback data
- Brand injection fix (injectBrand)
- Loader shows immediately on tap
- Template prefetch on page load (all keys)
- Cateina Technologies brand context file

### Data files updated
- content-generator.js — carousel support, tighter prompts
- pipeline.js — carousel dummy/AI path, validation skip
- mappers.js — carousel, editorial mappers
- field-schemas.js — carousel, editorial schemas
- dummy-fetcher.js — carousel, market, news dummy pools
