const path = require('path');
const fs   = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'events.db');

let SQL, db;

async function initDb() {
  if (db) return;
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  // Load existing DB file if it exists
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      date        TEXT NOT NULL,
      time        TEXT,
      cat         TEXT NOT NULL DEFAULT 'other',
      location    TEXT,
      description TEXT,
      source      TEXT,
      url         TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_cat  ON events(cat)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  persist();
  console.log('[db] SQLite (sql.js) ready:', DB_PATH);
}

/** Save DB to disk */
function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getEvents({ cat, from, to } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  let query  = `SELECT * FROM events WHERE date >= ?`;
  const params = [from || today];

  if (cat && cat !== 'all') { query += ` AND cat = ?`;  params.push(cat); }
  if (to)                   { query += ` AND date <= ?`; params.push(to); }
  query += ` ORDER BY date ASC, time ASC`;

  const stmt    = db.prepare(query);
  const results = [];
  stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function upsertEvents(events) {
  const stmt = db.prepare(`
    INSERT INTO events (id, title, date, time, cat, location, description, source, url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title       = excluded.title,
      date        = excluded.date,
      time        = excluded.time,
      cat         = excluded.cat,
      location    = excluded.location,
      description = excluded.description,
      source      = excluded.source,
      url         = excluded.url,
      updated_at  = datetime('now')
  `);

  for (const e of events) {
    stmt.run([e.id, e.title, e.date, e.time||null, e.cat, e.location||null,
              e.description||null, e.source||null, e.url||null]);
  }
  stmt.free();

  db.run(`INSERT INTO meta(key,value) VALUES('last_refresh', datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = datetime('now')`);

  persist();
  console.log(`[db] Upserted ${events.length} events`);
}

function getLastRefresh() {
  const res = db.exec(`SELECT value FROM meta WHERE key = 'last_refresh'`);
  return res[0]?.values?.[0]?.[0] || null;
}

module.exports = { initDb, getEvents, upsertEvents, getLastRefresh };

