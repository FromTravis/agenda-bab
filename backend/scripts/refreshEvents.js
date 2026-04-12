#!/usr/bin/env node
/**
 * Standalone refresh script – uses web scraper, no API key needed.
 * Usage:
 *   node scripts/refreshEvents.js
 *   node scripts/refreshEvents.js --pages 8       (scrape more pages)
 *   node scripts/refreshEvents.js --no-enrich     (skip detail-page fetching, faster)
 */


const { initDb, upsertEvents } = require('../db');
const { scrapeAllSources }     = require('../scraper');

const args        = process.argv.slice(2);
const pages       = parseInt(args[args.indexOf('--pages') + 1]) || 5;
const enrich      = !args.includes('--no-enrich');

(async () => {
  console.log(`[script] Starting scrape (pages=${pages}, enrich=${enrich})…`);
  try {
    await initDb();
    const events = await scrapeAllSources({ guidePages: pages, enrichDetails: enrich });
    upsertEvents(events);
    console.log(`[script] Done. ${events.length} events saved.`);
    process.exit(0);
  } catch (err) {
    console.error('[script] Error:', err);
    process.exit(1);
  }
})();
