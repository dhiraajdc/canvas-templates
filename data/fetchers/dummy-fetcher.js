/**
 * fetchers/dummy-fetcher.js
 * Provides a pool of 3 varied dummy samples per intent::mode.
 * Random pick on every call so repeated generates feel fresh.
 * Replace individual pools with AI calls later — structure stays identical.
 *
 * Usage:
 *   const raw = await DummyFetcher.fetchRaw('dyk::stat');
 */

const DUMMY_POOLS = {

  /* ── Did You Know — Stat ────────────────────────────────────── */
  'dyk::stat': [
    {
      stat_value: '73', stat_unit: '%',
      stat_desc: 'of remote workers report higher productivity working from home',
      source: 'Stanford Research 2024'
    },
    {
      stat_value: '2.4', stat_unit: 'B',
      stat_desc: 'people actively use social media every single day worldwide',
      source: 'Statista 2024'
    },
    {
      stat_value: '8', stat_unit: 'hrs',
      stat_desc: 'is the average time adults spend looking at screens each day',
      source: 'DataReportal 2024'
    },
  ],

  /* ── Did You Know — Ratio ───────────────────────────────────── */
  'dyk::ratio': [
    {
      ratio_numerator: '1', ratio_denominator: '5',
      ratio_desc: 'adults experience a mental health condition each year globally',
      source: 'WHO 2024'
    },
    {
      ratio_numerator: '1', ratio_denominator: '3',
      ratio_desc: 'people worldwide do not have access to clean drinking water',
      source: 'UNICEF 2024'
    },
    {
      ratio_numerator: '1', ratio_denominator: '8',
      ratio_desc: 'jobs globally are at high risk of automation in the next decade',
      source: 'McKinsey Global Institute 2024'
    },
  ],

  /* ── Did You Know — Timeframe ───────────────────────────────── */
  'dyk::timeframe': [
    {
      time_value: '60', time_unit: 'seconds',
      event_value: '500', event_unit: 'hours',
      event_desc: 'of video content are uploaded to YouTube',
      source: 'YouTube 2024'
    },
    {
      time_value: '24', time_unit: 'hours',
      event_value: '3.5', event_unit: 'million',
      event_desc: 'searches are made on Google every single day',
      source: 'Internet Live Stats 2024'
    },
    {
      time_value: '1', time_unit: 'minute',
      event_value: '1,000', event_unit: 'photos',
      event_desc: 'are shared on Instagram around the world',
      source: 'Hootsuite 2024'
    },
  ],

  /* ── Quote — Portrait ───────────────────────────────────────── */
  'quote::portrait': [
    {
      quote_text: 'Stay hungry. Stay foolish.',
      author_name: 'Steve Jobs',
      author_image: 'https://picsum.photos/id/1/400/400',
      source: 'Stanford Commencement, 2005'
    },
    {
      quote_text: 'The only way to do great work is to love what you do.',
      author_name: 'Steve Jobs',
      author_image: 'https://picsum.photos/id/10/400/400',
      source: 'Stanford Commencement, 2005'
    },
    {
      quote_text: 'In the middle of every difficulty lies opportunity.',
      author_name: 'Albert Einstein',
      author_image: 'https://picsum.photos/id/20/400/400',
      source: 'Einstein Archives, 1940'
    },
  ],

  /* ── Quote — Topic ──────────────────────────────────────────── */
  'quote::topic': [
    {
      quote_text: 'Culture eats strategy for breakfast.',
      author_name: 'Peter Drucker',
      topic: 'Leadership',
      source: 'Management Challenges, 1999'
    },
    {
      quote_text: 'The best investment you can make is in yourself.',
      author_name: 'Warren Buffett',
      topic: 'Finance',
      source: 'Berkshire Hathaway Annual Meeting, 2004'
    },
    {
      quote_text: 'An investment in knowledge pays the best interest.',
      author_name: 'Benjamin Franklin',
      topic: 'Knowledge',
      source: 'Poor Richard's Almanac, 1758'
    },
  ],

  /* ── Quote — Split ──────────────────────────────────────────── */
  'quote::split': [
    {
      quote_hook: 'First they ignore you.',
      quote_body: 'Then they laugh at you. Then they fight you. Then you win.',
      author_name: 'Mahatma Gandhi',
      source: 'Trade Union Speech, 1918'
    },
    {
      quote_hook: 'It always seems impossible.',
      quote_body: 'Until it is done. Every great achievement was once considered unreachable.',
      author_name: 'Nelson Mandela',
      source: 'Long Walk to Freedom, 1994'
    },
    {
      quote_hook: 'The secret of getting ahead.',
      quote_body: 'Is getting started. Stop overthinking and take the first small step today.',
      author_name: 'Mark Twain',
      source: 'Collected Works, 1889'
    },
  ],

  /* ── Tip — Checklist ────────────────────────────────────────── */
  'tip::checklist': [
    {
      tip_headline: 'Before every important meeting',
      item_1: 'Write down the one outcome you need',
      item_2: 'Prepare your first question in advance',
      item_3: 'Arrive 2 minutes early and breathe'
    },
    {
      tip_headline: 'Start every morning strong',
      item_1: 'Write one clear intention for the day',
      item_2: 'Avoid your phone for the first 30 minutes',
      item_3: 'Drink a full glass of water before coffee'
    },
    {
      tip_headline: 'End every workday well',
      item_1: 'Write your top 3 tasks for tomorrow',
      item_2: 'Clear your desk and close all browser tabs',
      item_3: 'Log off at the same time every day'
    },
  ],

  /* ── Tip — Do / Don't ───────────────────────────────────────── */
  'tip::do_dont': [
    {
      tip_headline: 'Writing a cold email',
      do_text: 'Lead with what is in it for them',
      dont_text: 'Lead with who you are and your credentials',
      category: 'Communication'
    },
    {
      tip_headline: 'Giving feedback to your team',
      do_text: 'Focus on the behaviour and its impact',
      dont_text: 'Make it personal or attack their character',
      category: 'Leadership'
    },
    {
      tip_headline: 'Negotiating your salary',
      do_text: 'Anchor high and let them counter',
      dont_text: 'Give your number first without research',
      category: 'Career'
    },
  ],

  /* ── Tip — Stat Tip ─────────────────────────────────────────── */
  'tip::stat_tip': [
    {
      tip_headline: 'Take more breaks while working',
      tip_body: 'Short breaks restore focus and prevent decision fatigue throughout the day.',
      stat_value: '52', stat_unit: 'min'
    },
    {
      tip_headline: 'Get outside for at least 20 minutes daily',
      tip_body: 'Natural light regulates your circadian rhythm and dramatically improves sleep quality.',
      stat_value: '20', stat_unit: 'min'
    },
    {
      tip_headline: 'Drink water before every meal',
      tip_body: 'Staying hydrated improves concentration, mood, and physical performance consistently.',
      stat_value: '500', stat_unit: 'ml'
    },
  ],

  /* ── Fun Fact — Versus ──────────────────────────────────────── */
  'funfact::versus': [
    {
      item_a: 'A day on Venus',
      item_b: 'A year on Venus',
      context: 'A day on Venus is actually longer than its entire year around the Sun',
      category: 'Space'
    },
    {
      item_a: 'All the humans on Earth',
      item_b: 'All the ants on Earth',
      context: 'Ants collectively outweigh all humans on the planet by a significant margin',
      category: 'Nature'
    },
    {
      item_a: 'The internet in 1995',
      item_b: 'A single smartphone today',
      context: 'Your smartphone has more computing power than the entire internet did 30 years ago',
      category: 'Technology'
    },
  ],

  /* ── Fun Fact — Number Fact ─────────────────────────────────── */
  'funfact::number_fact': [
    {
      fact_number: '10', fact_unit: 'M',
      fact_label: 'bacteria live on every square centimetre of your skin right now',
      category: 'Biology'
    },
    {
      fact_number: '100', fact_unit: 'B',
      fact_label: 'neurons fire in your brain every single second you are awake',
      category: 'Science'
    },
    {
      fact_number: '40', fact_unit: 'K',
      fact_label: 'litres of water are needed to produce just one kilogram of beef',
      category: 'Environment'
    },
  ],

  /* ── Fun Fact — Mind Blown ──────────────────────────────────── */
  'funfact::mind_blown': [
    {
      setup: 'Oxford University is older than the Aztec Empire',
      twist: 'Teaching began at Oxford in 1096. The Aztec Empire was not founded until 1428.',
      category: 'History',
      source: 'Encyclopaedia Britannica'
    },
    {
      setup: 'Cleopatra lived closer to the Moon landing than to the pyramids',
      twist: 'The Great Pyramid was built around 2560 BC. Cleopatra lived around 30 BC. The Moon landing was 1969.',
      category: 'History',
      source: 'Smithsonian Institute'
    },
    {
      setup: 'There are more trees on Earth than stars in the Milky Way',
      twist: 'Earth has around 3 trillion trees. The Milky Way contains an estimated 200 to 400 billion stars.',
      category: 'Nature',
      source: 'Nature Journal 2015'
    },
  ],

};

/* ── fetchRaw — random pick from pool ──────────────────────────
   @param  {string} key  — intent::mode e.g. 'dyk::stat'
   @returns {object}     — one data sample, randomly picked
──────────────────────────────────────────────────────────────── */
function fetchRaw(key) {
  const pool = DUMMY_POOLS[key];
  if (!pool || pool.length === 0) {
    console.warn('[DummyFetcher] No dummy pool for key:', key);
    return null;
  }
  /* Random pick — feels fresh on every generate */
  return JSON.parse(JSON.stringify(
    pool[Math.floor(Math.random() * pool.length)]
  ));
}

/* ── listKeys — returns all keys that have dummy data ──────────*/
function listKeys() { return Object.keys(DUMMY_POOLS); }

window.DummyFetcher = { fetchRaw, listKeys, DUMMY_POOLS };
