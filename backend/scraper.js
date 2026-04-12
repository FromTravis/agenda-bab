/**
 * scraper.js – AgendaBAB v2
 * Sources: guide-du-paysbasque, bayonne.fr, destination-biarritz,
 *          atabal-biarritz, scenenationale, loco-motive (Le Magnéto),
 *          lageneraleanglet, la-rhapsodie, mbh.bayonne.fr
 */
const https  = require('https');
const http   = require('http');
const crypto = require('crypto');

// ── helpers ──────────────────────────────────────────────────────────────────

function fetchHtml(url, ms = 15000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AgendaBAB/2.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchHtml(res.headers.location, ms).then(resolve).catch(reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} – ${url}`));
      let b = ''; res.setEncoding('utf8');
      res.on('data', c => b += c); res.on('end', () => resolve(b));
    });
    req.on('error', reject);
    req.setTimeout(ms, () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
  });
}

const makeId   = (t, d) => crypto.createHash('md5').update(`${t}|${d}`).digest('hex').slice(0, 12);
const pad      = n => String(n).padStart(2, '0');
const stripT   = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const decodeH  = s => (s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,c)=>String.fromCharCode(+c)).trim();
const todayStr = () => new Date().toISOString().slice(0,10);
const sleep    = ms => new Promise(r => setTimeout(r, ms));

const MO = {janvier:0,février:1,fevrier:1,mars:2,avril:3,mai:4,juin:5,juillet:6,août:7,aout:7,septembre:8,octobre:9,novembre:10,décembre:11,decembre:11};

function parseFrDate(raw) {
  if (!raw) return null;
  raw = raw.trim().toLowerCase();
  let m;
  if ((m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)))         return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  if ((m = raw.match(/(\d{1,2})\s+([a-zéûùô]+)\s+(\d{4})/)))    { const mo=MO[m[2]]; if(mo!==undefined) return `${m[3]}-${pad(mo+1)}-${pad(m[1])}`; }
  if ((m = raw.match(/(\d{1,2})\.(\d{2})\.(\d{2})$/)))           return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

function mapCat(s) {
  s = (s||'').toLowerCase();
  if (/concert|musique|jazz|rock|chorale|chanson|fanfare|opéra|electro|dj|hip.hop|reggae|blues|soul/.test(s)) return 'music';
  if (/festival/.test(s)) return 'festival';
  if (/sport|surf|pelote|rugby|trail|vélo|voile|natation|triathlon|foot|tennis|escalade/.test(s)) return 'sport';
  if (/nature|randonnée|rando|balade|ornitholog|écolog|jardin/.test(s)) return 'nature';
  if (/fête|feria|carnaval|festivité/.test(s)) return 'festival';
  if (/expo|théâtre|danse|cinéma|spectacle|art|conférence|patrimoine|musée|galerie|visite/.test(s)) return 'culture';
  return 'other';
}

function extractEvents(html, opts) {
  // Generic WordPress-style event extractor used by several venues
  const { defaultCat, defaultLocation, defaultSource, defaultUrl } = opts;
  const events = [];
  const cardRe = /<(?:article|div)[^>]*class="[^"]*(?:event|tribe|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/gi;
  let cm;
  while ((cm = cardRe.exec(html)) !== null) {
    const b = cm[1];
    const titleM = b.match(/<h[234][^>]*>([\s\S]{3,150}?)<\/h[234]>/);
    if (!titleM) continue;
    const title = decodeH(stripT(titleM[1])).trim();
    const dateM = b.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i)
               || b.match(/(\d{1,2})\/(\d{2})\/(\d{4})/);
    if (!dateM) continue;
    const date = parseFrDate(dateM[0]);
    if (!date || date < todayStr()) continue;
    const linkM = b.match(/href="(https?:\/\/[^"]+)"/);
    events.push({ id: makeId(title,date), title, date, time:null, cat: defaultCat, location: defaultLocation, description:null, source: defaultSource, url: linkM?linkM[1]:defaultUrl });
  }
  return events;
}

// ── 1. guide-du-paysbasque.com ────────────────────────────────────────────────

const GUIDE_BASE = 'https://www.guide-du-paysbasque.com';

function parseGuidePage(html) {
  const events = [];
  const re = /<a href="(\/fr\/agenda\/[^"]+)"[^>]*>\s*<img[^>]+>\s*<\/a>[\s\S]{0,80}?<a href="\1"[^>]*>([^<]{5,150})<\/a>[\s\S]{0,300}?(\d{2}\/\d{2}\/\d{4})/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url   = GUIDE_BASE + m[1];
    const title = decodeH(m[2]).trim();
    const date  = parseFrDate(m[3]);
    if (!date || date < todayStr() || title.length < 4) continue;
    const catRaw = m[1].split('/')[3] || '';
    events.push({ id:makeId(title,date), title, date, time:null, cat:mapCat(catRaw), location:null, description:null, source:'guide-du-paysbasque.com', url });
  }
  return events;
}

async function enrichGuideEvent(ev) {
  try {
    const html = await fetchHtml(ev.url);
    const tm = html.match(/(\d{1,2})[hH:](\d{2})/);
    if (tm) ev.time = `${pad(tm[1])}:${tm[2]}`;
    const lm = html.match(/[Ll]ieu\s*:?\s*<\/?\w*>?\s*([^<\n]{3,80})/);
    if (lm) ev.location = decodeH(lm[1].trim());
    const dm = html.match(/<p>([^<]{30,400})<\/p>/);
    if (dm) ev.description = decodeH(dm[1]).slice(0,250);
  } catch (_) {}
  return ev;
}

async function scrapeGuide({ pages=4, enrichDetails=true } = {}) {
  console.log('[guide] Starting…');
  const all = [];
  for (let p=1; p<=pages; p++) {
    const url = p===1 ? `${GUIDE_BASE}/fr/agenda.html` : `${GUIDE_BASE}/fr/agenda.html?goto=${p}`;
    try { const evs = parseGuidePage(await fetchHtml(url)); console.log(`[guide] p${p}: ${evs.length}`); all.push(...evs); }
    catch (e) { console.warn(`[guide] p${p} failed:`, e.message); }
    if (p < pages) await sleep(700);
  }
  const seen=new Set(), unique=all.filter(e=>{ if(seen.has(e.id))return false; seen.add(e.id); return true; });
  if (enrichDetails) for (let i=0; i<Math.min(unique.length,25); i++) { await enrichGuideEvent(unique[i]); await sleep(250); }
  console.log(`[guide] ${unique.length} events total`);
  return unique;
}

// ── 2. atabal-biarritz.fr ─────────────────────────────────────────────────────

async function scrapeAtabal() {
  console.log('[atabal] Starting…');
  try {
    const html = await fetchHtml('https://www.atabal-biarritz.fr/');
    const events = [];
    const re = /<h3[^>]*>([\s\S]{3,150}?)<\/h3>[\s\S]{0,500}?<h[456][^>]*>([\s\S]{0,60}?)<\/h[456]>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const title = decodeH(stripT(m[1])).trim();
      const date  = parseFrDate(stripT(m[2]).trim());
      if (!date || date < todayStr() || title.length < 3) continue;
      events.push({ id:makeId(title,date), title, date, time:null, cat:'music', location:'Atabal, Biarritz', description:null, source:'atabal-biarritz.fr', url:'https://www.atabal-biarritz.fr/' });
    }
    console.log(`[atabal] ${events.length} events`);
    return events;
  } catch (e) { console.warn('[atabal] Failed:', e.message); return []; }
}

// ── 3. scenenationale.fr ──────────────────────────────────────────────────────

async function scrapeSceneNationale() {
  console.log('[snsa] Starting…');
  try {
    const html = await fetchHtml('https://www.scenenationale.fr/spectacles');
    const events = [];
    const re = /<article[\s\S]*?<\/article>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const b = m[0];
      const tm = b.match(/<h[23][^>]*>([\s\S]{3,150}?)<\/h[23]>/);
      if (!tm) continue;
      const title = decodeH(stripT(tm[1])).trim();
      const dm = b.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i);
      if (!dm) continue;
      const mo = MO[dm[2].toLowerCase()]; if (mo===undefined) continue;
      const date = `${dm[3]}-${pad(mo+1)}-${pad(dm[1])}`;
      if (date < todayStr()) continue;
      const lm = b.match(/href="(https?:\/\/www\.scenenationale\.fr\/[^"]+)"/);
      events.push({ id:makeId(title,date), title, date, time:null, cat:'culture', location:'Scène nationale, Bayonne/Hendaye', description:null, source:'scenenationale.fr', url:lm?lm[1]:'https://www.scenenationale.fr/spectacles' });
    }
    console.log(`[snsa] ${events.length} events`);
    return events;
  } catch (e) { console.warn('[snsa] Failed:', e.message); return []; }
}

// ── 4. loco-motive.fr (Le Magnéto) ───────────────────────────────────────────

async function scrapeLocoMotive() {
  console.log('[loco] Starting…');
  try {
    const html = await fetchHtml('https://loco-motive.fr/agenda/');
    const events = extractEvents(html, { defaultCat:'music', defaultLocation:'Le Magnéto, Bayonne', defaultSource:'loco-motive.fr', defaultUrl:'https://loco-motive.fr/agenda/' });
    console.log(`[loco] ${events.length} events`);
    return events;
  } catch (e) { console.warn('[loco] Failed:', e.message); return []; }
}

// ── 5. lageneraleanglet.com ───────────────────────────────────────────────────

async function scrapeGenerale() {
  console.log('[generale] Starting…');
  try {
    const html = await fetchHtml('https://lageneraleanglet.com/les-activites-hebdomadaires/');
    const events = extractEvents(html, { defaultCat:'culture', defaultLocation:'La Générale, Anglet', defaultSource:'lageneraleanglet.com', defaultUrl:'https://lageneraleanglet.com/les-activites-hebdomadaires/' });
    console.log(`[generale] ${events.length} events`);
    return events;
  } catch (e) { console.warn('[generale] Failed:', e.message); return []; }
}

// ── 6. la-rhapsodie.com ───────────────────────────────────────────────────────

async function scrapeRhapsodie() {
  console.log('[rhapsodie] Starting…');
  try {
    const html = await fetchHtml('https://www.la-rhapsodie.com/programmation/');
    const events = [];
    // Rhapsodie uses SVG images for their programme – look for month headings + any h2/h3 titles
    const re = /<h[23][^>]*>([\s\S]{3,150}?)<\/h[23]>/g;
    // Also look for date patterns near titles in surrounding text
    const blocks = html.match(/<(?:div|section)[^>]*class="[^"]*(?:event|prog|item|card)[^"]*"[^>]*>[\s\S]{0,600}?<\/(?:div|section)>/gi) || [];
    for (const b of blocks) {
      const tm = b.match(/<h[234][^>]*>([\s\S]{3,150}?)<\/h[234]>/);
      if (!tm) continue;
      const title = decodeH(stripT(tm[1])).trim();
      const dm = b.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i)
              || b.match(/(\d{1,2})\/(\d{2})\/(\d{4})/);
      if (!dm) continue;
      const date = parseFrDate(dm[0]);
      if (!date || date < todayStr()) continue;
      events.push({ id:makeId(title,date), title, date, time:null, cat:'music', location:'La Rhapsodie, Biarritz', description:null, source:'la-rhapsodie.com', url:'https://www.la-rhapsodie.com/programmation/' });
    }
    console.log(`[rhapsodie] ${events.length} events`);
    return events;
  } catch (e) { console.warn('[rhapsodie] Failed:', e.message); return []; }
}

// ── 7. mbh.bayonne.fr – Musée Bonnat-Helleu ──────────────────────────────────

async function scrapeMBH() {
  console.log('[mbh] Starting…');
  try {
    const html = await fetchHtml('https://mbh.bayonne.fr/');
    const events = [];
    const re = /<h3[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]{3,150}?)<\/a>\s*<\/h3>([\s\S]{0,400}?)<\/(?:li|div|article)/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const url   = m[1].startsWith('http') ? m[1] : 'https://mbh.bayonne.fr' + m[1];
      const title = decodeH(stripT(m[2])).trim();
      const block = m[3];
      const dm    = block.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i);
      if (!dm) continue;
      const date = parseFrDate(dm[0]);
      if (!date || date < todayStr()) continue;
      const desc = decodeH(stripT(block)).slice(0,200);
      events.push({ id:makeId(title,date), title, date, time:null, cat:'culture', location:'Musée Bonnat-Helleu, Bayonne', description:desc||null, source:'mbh.bayonne.fr', url });
    }
    console.log(`[mbh] ${events.length} events`);
    return events;
  } catch (e) { console.warn('[mbh] Failed:', e.message); return []; }
}

// ── 8. bayonne.fr ─────────────────────────────────────────────────────────────

async function scrapeBayonne() {
  console.log('[bayonne] Starting…');
  try {
    const html = await fetchHtml('https://www.bayonne.fr/information-transversale/tout-lagenda');
    const events = [];
    const re = /<article[\s\S]*?<\/article>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const b = m[0];
      const tm = b.match(/<h[23][^>]*>([\s\S]{4,150}?)<\/h[23]>/);
      if (!tm) continue;
      const title = decodeH(stripT(tm[1]));
      const dm = b.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i);
      if (!dm) continue;
      const mo=MO[dm[2].toLowerCase()]; if(mo===undefined) continue;
      const date=`${dm[3]}-${pad(mo+1)}-${pad(dm[1])}`;
      if (date<todayStr()) continue;
      events.push({ id:makeId(title,date), title, date, time:null, cat:'other', location:'Bayonne', description:null, source:'bayonne.fr', url:'https://www.bayonne.fr/information-transversale/tout-lagenda' });
    }
    console.log(`[bayonne] ${events.length} events`);
    return events;
  } catch (e) { console.warn('[bayonne] Failed:', e.message); return []; }
}

// ── 9. destination-biarritz.fr ────────────────────────────────────────────────

async function scrapeBiarritz() {
  console.log('[biarritz] Starting…');
  try {
    const html = await fetchHtml('https://www.destination-biarritz.fr/agenda/');
    const events = [];
    const re = /<(?:div|article|li)[^>]*class="[^"]*(?:event|agenda|item)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const b=m[1], tm=b.match(/<(?:h[1-4]|strong|a)[^>]*>([\s\S]{5,150}?)<\/(?:h[1-4]|strong|a)>/);
      if (!tm) continue;
      const title=decodeH(stripT(tm[1]));
      const dm=b.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i);
      if (!dm) continue;
      const mo=MO[dm[2].toLowerCase()]; if(mo===undefined) continue;
      const date=`${dm[3]}-${pad(mo+1)}-${pad(dm[1])}`;
      if (date<todayStr()) continue;
      events.push({ id:makeId(title,date), title, date, time:null, cat:'culture', location:'Biarritz', description:null, source:'destination-biarritz.fr', url:'https://www.destination-biarritz.fr/agenda/' });
    }
    console.log(`[biarritz] ${events.length} events`);
    return events;
  } catch (e) { console.warn('[biarritz] Failed:', e.message); return []; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function scrapeAllSources({ guidePages=4, enrichDetails=true } = {}) {
  console.log('[scraper] Running all 9 sources…');
  const results = await Promise.allSettled([
    scrapeGuide({ pages:guidePages, enrichDetails }),
    scrapeAtabal(),
    scrapeSceneNationale(),
    scrapeLocoMotive(),
    scrapeGenerale(),
    scrapeRhapsodie(),
    scrapeMBH(),
    scrapeBayonne(),
    scrapeBiarritz(),
  ]);
  const all = results.flatMap(r => r.status==='fulfilled' ? r.value : []);
  const seen=new Set(), unique=all.filter(e=>{ if(!e.id||seen.has(e.id))return false; seen.add(e.id); return true; });
  unique.sort((a,b)=>a.date.localeCompare(b.date));
  console.log(`[scraper] Done – ${unique.length} unique events from ${results.filter(r=>r.status==='fulfilled'&&r.value.length>0).length}/9 sources`);
  return unique;
}

module.exports = { scrapeAllSources, scrapeGuide, scrapeAtabal, scrapeSceneNationale, scrapeLocoMotive, scrapeGenerale, scrapeRhapsodie, scrapeMBH, scrapeBayonne, scrapeBiarritz };
