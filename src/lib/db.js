import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'concert-tracker.db');

let db = null;

export function getDb() {
  if (db) return db;

  // Ensure data directory exists
  const fs = require('fs');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      musicbrainz_id TEXT,
      ticketmaster_id TEXT,
      image_url TEXT,
      is_member INTEGER DEFAULT 0,
      parent_artist_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artist_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      url_type TEXT NOT NULL,
      url TEXT NOT NULL,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      venue TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      date TEXT NOT NULL,
      time TEXT,
      source_url TEXT,
      source TEXT DEFAULT 'ticketmaster',
      raw_data TEXT,
      first_seen_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_artist_mbid 
    ON artists(musicbrainz_id) 
    WHERE is_member = 0 AND musicbrainz_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      website_url TEXT NOT NULL UNIQUE,
      city TEXT,
      state TEXT,
      country TEXT DEFAULT 'US',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup 
      ON events(artist_id, date, venue, city);

    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_artist ON events(artist_id);
    CREATE INDEX IF NOT EXISTS idx_artist_urls_artist ON artist_urls(artist_id);
  `);

  // Migration: add ticketmaster_id if missing
  try {
    db.prepare('SELECT ticketmaster_id FROM artists LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE artists ADD COLUMN ticketmaster_id TEXT');
  }

  return db;
}

// --- Artist helpers ---
export function getAllArtists() {
  const db = getDb();
  const artists = db.prepare(`
    SELECT a.*, 
      (SELECT COUNT(*) FROM events e WHERE e.artist_id = a.id AND e.date >= date('now')) as upcoming_count
    FROM artists a 
    WHERE a.is_member = 0 
    ORDER BY a.name
  `).all();

  for (const artist of artists) {
    artist.members = db.prepare(
      'SELECT * FROM artists WHERE parent_artist_id = ? ORDER BY name'
    ).all(artist.id);
    artist.urls = db.prepare(
      'SELECT * FROM artist_urls WHERE artist_id = ? ORDER BY url_type'
    ).all(artist.id);
    for (const member of artist.members) {
      member.urls = db.prepare(
        'SELECT * FROM artist_urls WHERE artist_id = ? ORDER BY url_type'
      ).all(member.id);
    }
  }

  return artists;
}

export function addArtist({ name, musicbrainz_id, ticketmaster_id, image_url, is_member = false, parent_artist_id = null }) {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO artists (name, musicbrainz_id, ticketmaster_id, image_url, is_member, parent_artist_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, musicbrainz_id || null, ticketmaster_id || null, image_url || null, is_member ? 1 : 0, parent_artist_id || null);
    return result.lastInsertRowid;
  } catch (err) {
    // Handle race conditions where another request just inserted this artist
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && musicbrainz_id && !is_member) {
      const existing = db.prepare('SELECT id FROM artists WHERE musicbrainz_id = ? AND is_member = 0').get(musicbrainz_id);
      if (existing) return existing.id;
    }
    throw err;
  }
}

export function removeArtist(id) {
  const db = getDb();
  db.prepare('DELETE FROM artists WHERE id = ?').run(id);
}

export function addArtistUrl(artist_id, url_type, url) {
  const db = getDb();
  // Avoid duplicates
  const existing = db.prepare(
    'SELECT id FROM artist_urls WHERE artist_id = ? AND url_type = ? AND url = ?'
  ).get(artist_id, url_type, url);
  if (existing) return existing.id;
  const result = db.prepare(
    'INSERT INTO artist_urls (artist_id, url_type, url) VALUES (?, ?, ?)'
  ).run(artist_id, url_type, url);
  return result.lastInsertRowid;
}

export function removeArtistUrl(id) {
  const db = getDb();
  db.prepare('DELETE FROM artist_urls WHERE id = ?').run(id);
}

// --- Event helpers ---
export function getEvents({ startDate, endDate, artistId, limit } = {}) {
  const db = getDb();
  let sql = `
    SELECT e.*, a.name as artist_name 
    FROM events e 
    JOIN artists a ON e.artist_id = a.id 
    WHERE 1=1
  `;
  const params = [];

  if (startDate) { sql += ' AND e.date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND e.date <= ?'; params.push(endDate); }
  if (artistId) { sql += ' AND e.artist_id = ?'; params.push(artistId); }

  sql += ' ORDER BY e.date ASC';
  if (limit) { sql += ' LIMIT ?'; params.push(limit); }

  return db.prepare(sql).all(...params);
}

export function upsertEvent({ artist_id, title, venue, city, state, country, date, time, source_url, source }) {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO events (artist_id, title, venue, city, state, country, date, time, source_url, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(artist_id, date, venue, city) DO UPDATE SET
        title = excluded.title,
        source_url = COALESCE(excluded.source_url, events.source_url),
        time = COALESCE(excluded.time, events.time),
        state = COALESCE(excluded.state, events.state),
        country = COALESCE(excluded.country, events.country),
        source = excluded.source
    `).run(artist_id, title, venue || null, city || null, state || null, country || null, date, time || null, source_url || null, source || 'unknown');
    return { id: result.lastInsertRowid, isNew: result.changes > 0 };
  } catch (e) {
    console.error('Error upserting event:', e.message);
    return { id: null, isNew: false };
  }
}

export function getNewEventsSince(since) {
  const db = getDb();
  return db.prepare(`
    SELECT e.*, a.name as artist_name 
    FROM events e 
    JOIN artists a ON e.artist_id = a.id 
    WHERE e.first_seen_at >= ? AND e.date >= date('now')
    ORDER BY e.date ASC
  `).all(since);
}

// --- Settings helpers ---
export function getSetting(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getAllSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// --- Venue helpers ---
export function getAllVenues() {
  const db = getDb();
  return db.prepare('SELECT * FROM venues ORDER BY name').all();
}

export function addVenue({ name, website_url, city, state, country }) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO venues (name, website_url, city, state, country)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, website_url, city || null, state || null, country || 'US');
  return result.lastInsertRowid;
}

export function removeVenue(id) {
  const db = getDb();
  db.prepare('DELETE FROM venues WHERE id = ?').run(id);
}
