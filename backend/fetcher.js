const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = ['sport', 'culture', 'music', 'festival', 'nature', 'other'];

/**
 * Generate a stable ID from title + date to allow upserts without duplicates.
 */
function makeId(title, date) {
  return crypto.createHash('md5').update(`${title}|${date}`).digest('hex').slice(0, 12);
}

/**
 * Validate and normalize a single event object returned by the AI.
 */
function normalizeEvent(raw) {
  if (!raw.title || !raw.date) return null;

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;

  // Validate date is not in the past by more than 1 day
  const eventDate = new Date(raw.date);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (eventDate < yesterday) return null;

  const cat = CATEGORIES.includes(raw.cat) ? raw.cat : 'other';

  return {
    id:          raw.id || makeId(raw.title, raw.date),
    title:       String(raw.title).slice(0, 200),
    date:        raw.date,
    time:        raw.time || null,
    cat,
    location:    raw.location ? String(raw.location).slice(0, 200) : null,
    description: raw.description ? String(raw.description).slice(0, 500) : null,
    source:      raw.source || null,
    url:         raw.url || null,
  };
}

/**
 * Call the Anthropic API with web_search to find real upcoming events.
 */
async function fetchEventsFromAI() {
  const today = new Date();
  const in90 = new Date(today.getTime() + 90 * 24 * 3600 * 1000);
  const fmt = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const systemPrompt = `Tu es un assistant spécialisé dans l'agenda événementiel de la région Bayonne-Anglet-Biarritz (BAB) et du Pays Basque français.

Utilise la recherche web pour trouver des événements RÉELS et ACTUELS dans cette région.

Retourne UNIQUEMENT un objet JSON valide (sans backticks, sans texte autour) avec cette structure EXACTE :
{"events":[{"id":"abc123","title":"Nom","date":"YYYY-MM-DD","time":"HH:MM","cat":"sport|culture|music|festival|nature|other","location":"Lieu, Ville","description":"Max 100 caractères","source":"site.fr"}]}

Règles :
- Dates entre ${fmt(today)} et ${fmt(in90)} UNIQUEMENT
- Maximum 15 événements
- Descriptions très courtes (max 100 caractères)
- IDs uniques 8 caractères alphanumériques`;

  const userMessage = `Trouve 10 à 15 événements à venir (concerts, sport, expos, festivals) dans la région Bayonne-Anglet-Biarritz et Pays Basque. Retourne uniquement le JSON.`;

  console.log('[fetcher] Calling Anthropic API with web search...');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  // Extract text from the response
  let jsonText = '';
  for (const block of response.content) {
    if (block.type === 'text' && block.text) {
      jsonText = block.text;
      break;
    }
  }

  if (!jsonText) throw new Error('No text response from AI');

  // Strip markdown fences
  const clean = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    // Try to extract just the JSON object — handle truncated JSON by cutting at last complete event
    const start = clean.indexOf('{');
    const lastBracket = clean.lastIndexOf('},');
    if (start !== -1 && lastBracket !== -1) {
      try {
        const truncated = clean.slice(start, lastBracket + 1) + ']}';
        parsed = JSON.parse(truncated);
      } catch (_) {
        throw new Error('Could not parse JSON from AI response: ' + e.message);
      }
    } else {
      throw new Error('Could not parse JSON from AI response: ' + e.message);
    }
  }

  const rawEvents = parsed.events || [];
  console.log(`[fetcher] Received ${rawEvents.length} raw events from AI`);

  const normalized = rawEvents.map(normalizeEvent).filter(Boolean);
  console.log(`[fetcher] ${normalized.length} events after validation`);

  return normalized;
}

module.exports = { fetchEventsFromAI };
