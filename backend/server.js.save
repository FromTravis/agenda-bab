
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const path    = require('path');
const fs      = require('fs');

const { initDb, getEvents, upsertEvents, getLastRefresh } = require('./db');
const { scrapeAllSources } = require('./scraper');

let fetchEventsFromAI = null;
if (process.env.ANTHROPIC_API_KEY) {
  try { fetchEventsFromAI = require('./fetcher').fetchEventsFromAI; } catch (_) {}
}

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve frontend – support both local and Railway layouts
const FRONTEND = fs.existsSync(path.join(__dirname, '../frontend/public'))
  ? path.join(__dirname, '../frontend/public')
  : path.join(__dirname, 'frontend/public');
app.use(express.static(FRONTEND));

// ──────────────────────────────────────────────
// Core refresh – supports mode: 'scraper' | 'ai' | 'both'
// ──────────────────────────────────────────────
async function runRefresh(mode = 'both') {
  let scraperEvents = [];
  let aiEvents      = [];

  const useScraper = mode === 'scraper' || mode === 'both';
  const useAI      = (mode === 'ai' || mode === 'both') && !!fetchEventsFromAI;

  if (useScraper) {
    try {
      scraperEvents = await scrapeAllSources({ guidePages: 4, enrichDetails: true });
      console.log(`[refresh] Scraper: ${scraperEvents.length} events`);
    } catch (e) { console.warn('[refresh] Scraper error:', e.message); }
  }

  if (useAI) {
    try {
      aiEvents = await fetchEventsFromAI();
      console.log(`[refresh] AI: ${aiEvents.length} events`);
    } catch (e) { console.warn('[refresh] AI error:', e.message); }
  }

  // Merge – AI events fill gaps not already covered by scraper
  const existingIds = new Set(scraperEvents.map(e => e.id));
  const merged = [...scraperEvents, ...aiEvents.filter(e => !existingIds.has(e.id))];

  if (merged.length === 0) throw new Error('All sources returned 0 events');
  upsertEvents(merged);
  console.log(`[refresh] Saved ${merged.length} total events (mode: ${mode})`);
  return merged;
}

// ──────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  try {
    const { cat, from, to } = req.query;
    const events      = getEvents({ cat, from, to });
    const lastRefresh = getLastRefresh();
    res.json({ events, lastRefresh, total: events.length });
  } catch (err) {
    console.error('GET /api/events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/refresh  body: { mode: 'scraper' | 'ai' | 'both' }
app.post('/api/refresh', async (req, res) => {
  const mode = req.body?.mode || 'both';
  console.log(`[api] Refresh triggered – mode: ${mode}`);
  try {
    const events = await runRefresh(mode);
    res.json({ success: true, count: events.length, mode, events });
  } catch (err) {
    console.error('[api] Refresh error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status:      'ok',
    lastRefresh: getLastRefresh(),
    uptime:      process.uptime(),
    hasAiKey:    !!fetchEventsFromAI,
    hasScraper:  true,
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

// ──────────────────────────────────────────────
// Cron: daily 06:00 Paris – uses 'both' by default
// ──────────────────────────────────────────────
cron.schedule('0 6 * * *', async () => {
  console.log('[cron] Daily refresh');
  try {
    const events = await runRefresh('both');
    console.log(`[cron] Done – ${events.length} events`);
  } catch (err) { console.error('[cron] Error:', err); }
}, { timezone: 'Europe/Paris' });

// ──────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🏄 Agenda BAB running on http://localhost:${PORT}`);
    console.log(`   Scraper: ✓  |  AI: ${fetchEventsFromAI ? '✓' : '✗ (no API key)'}`);
    console.log(`   UI: http://localhost:${PORT}\n`);
  });
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
