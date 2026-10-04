/**
 * Database layer — SQLite via sql.js (pure JavaScript/WASM, no native build step).
 *
 * A tiny wrapper mimics the better-sqlite3 API (prepare().get/all/run, exec,
 * transaction) so the rest of the app reads like ordinary synchronous SQLite.
 * The database is persisted to a single file on disk after every write.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'data', 'atelier.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

/* ------------------------- better-sqlite3-style shim ---------------------- */
function norm(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
function bindArgs(args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const o = {};
    for (const [k, v] of Object.entries(args[0])) o['@' + k] = norm(v);
    return o;
  }
  return args.map(norm);
}

class Wrapper {
  constructor(sqldb, onWrite) {
    this._db = sqldb;
    this._onWrite = onWrite;
  }
  prepare(sql) {
    const self = this;
    return {
      get(...args) {
        const s = self._db.prepare(sql);
        try { s.bind(bindArgs(args)); return s.step() ? s.getAsObject() : undefined; }
        finally { s.free(); }
      },
      all(...args) {
        const s = self._db.prepare(sql);
        const out = [];
        try { s.bind(bindArgs(args)); while (s.step()) out.push(s.getAsObject()); }
        finally { s.free(); }
        return out;
      },
      run(...args) {
        self._db.run(sql, bindArgs(args));
        const changes = self._db.getRowsModified();
        let lastInsertRowid = 0;
        const r = self._db.exec('SELECT last_insert_rowid() AS id');
        if (r[0] && r[0].values[0]) lastInsertRowid = r[0].values[0][0];
        self._onWrite();
        return { changes, lastInsertRowid };
      }
    };
  }
  exec(sql) { this._db.run(sql); this._onWrite(); return this; }
  pragma() { return this; } // no-op (WAL etc. not needed for sql.js)
  transaction(fn) {
    const self = this;
    return (arg) => {
      self._db.run('BEGIN');
      try { const res = fn(arg); self._db.run('COMMIT'); self._onWrite(); return res; }
      catch (e) { self._db.run('ROLLBACK'); throw e; }
    };
  }
}

/* --------------------------------- Connect -------------------------------- */
// `db` is a live proxy so modules can `require` it before connect() finishes.
const holder = { wrapper: null };
const db = {
  prepare: (...a) => holder.wrapper.prepare(...a),
  exec: (...a) => holder.wrapper.exec(...a),
  pragma: (...a) => holder.wrapper.pragma(...a),
  transaction: (...a) => holder.wrapper.transaction(...a)
};

let saveTimer = null;
function scheduleSave(sqldb) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DB_PATH, Buffer.from(sqldb.export())); }
    catch (e) { console.error('DB save failed:', e.message); }
  }, 40);
}

let connectPromise = null;
async function connect() {
  if (holder.wrapper) return db;
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: (f) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f)
    });
    const sqldb = fs.existsSync(DB_PATH)
      ? new SQL.Database(fs.readFileSync(DB_PATH))
      : new SQL.Database();
    const onWrite = () => scheduleSave(sqldb);
    holder.wrapper = new Wrapper(sqldb, onWrite);

    // Flush pending saves on shutdown so nothing is lost.
    const flush = () => { try { fs.writeFileSync(DB_PATH, Buffer.from(sqldb.export())); } catch (e) {} };
    process.on('exit', flush);
    process.on('SIGINT', () => { flush(); process.exit(0); });
    process.on('SIGTERM', () => { flush(); process.exit(0); });

    init();
    return db;
  })();
  return connectPromise;
}

/* --------------------------------- Schema --------------------------------- */
function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL, value INTEGER NOT NULL DEFAULT 0,
      suffix TEXT DEFAULT '', sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, category TEXT DEFAULT 'Work', description TEXT DEFAULT '',
      cover_image TEXT DEFAULT '', url TEXT DEFAULT '', featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'image', title TEXT DEFAULT '', src TEXT NOT NULL,
      poster TEXT DEFAULT '', caption TEXT DEFAULT '', sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, excerpt TEXT DEFAULT '',
      content TEXT DEFAULT '', cover_image TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
      author TEXT DEFAULT 'Studio', tags TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, email TEXT, subject TEXT, message TEXT,
      read INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!existing) {
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(username, bcrypt.hashSync(password, 10), 'admin');
    console.log(`✓ Created admin user "${username}"`);
  }
}

const DEFAULT_SETTINGS = {
  brand: 'ATELIER',
  tagline: 'Creative Studio & Visual Artist',
  hero_title: 'We turn the impossible into the unforgettable.',
  hero_subtitle: 'A multidisciplinary studio crafting brands, motion, and visual experiences that move people — and markets.',
  hero_cta_label: 'View the work',
  hero_cta_href: '#portfolio',
  about_title: 'Design with intent. Craft without compromise.',
  about_body: 'For three decades we have partnered with ambitious brands to build identities, campaigns, and digital experiences that feel inevitable. From the first sketch to the final frame, every pixel earns its place. We work across branding, art direction, motion, 3D, and web — one studio, end to end.',
  contact_email: 'hello@atelier.studio',
  contact_location: 'Available worldwide · Based in Novi, MI',
  social_instagram: 'https://instagram.com',
  social_behance: 'https://behance.net',
  social_linkedin: 'https://linkedin.com',
  social_dribbble: 'https://dribbble.com',
  accent: '#ff6f5e'
};

function seed({ force = false } = {}) {
  init();
  ensureAdmin();

  const setSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const insertIfMissing = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    (force ? setSetting : insertIfMissing).run({ key, value: String(value) });
  }

  if (force || db.prepare('SELECT COUNT(*) c FROM stats').get().c === 0) {
    if (force) db.exec('DELETE FROM stats');
    const ins = db.prepare('INSERT INTO stats (label, value, suffix, sort_order) VALUES (?,?,?,?)');
    [
      ['Years of craft', 30, '+', 1],
      ['Projects delivered', 480, '+', 2],
      ['Global clients', 120, '', 3],
      ['Design awards', 24, '', 4]
    ].forEach(r => ins.run(...r));
  }

  if (force || db.prepare('SELECT COUNT(*) c FROM projects').get().c === 0) {
    if (force) db.exec('DELETE FROM projects');
    const ins = db.prepare('INSERT INTO projects (title, category, description, cover_image, url, featured, sort_order) VALUES (?,?,?,?,?,?,?)');
    [
      ['Meridian Rebrand', 'Branding', 'A full identity system for a fintech challenger — logo, motion, and design language.', '/assets/placeholders/p1.svg', '#', 1, 1],
      ['Nocturne Film Titles', 'Motion', 'Title sequence and 3D motion design for an award-winning short film.', '/assets/placeholders/p2.svg', '#', 1, 2],
      ['Solaris Campaign', 'Art Direction', 'Print and social campaign that lifted engagement by 3x across channels.', '/assets/placeholders/p3.svg', '#', 0, 3],
      ['Atlas Web Experience', 'Web', 'An immersive product site with scroll-driven storytelling and WebGL.', '/assets/placeholders/p4.svg', '#', 1, 4],
      ['Ember Packaging', 'Packaging', 'Sculptural packaging system for a premium coffee house.', '/assets/placeholders/p5.svg', '#', 0, 5],
      ['Vertex 3D Series', '3D', 'A collection of rendered artworks exploring light and geometry.', '/assets/placeholders/p6.svg', '#', 0, 6]
    ].forEach(r => ins.run(...r));
  }

  if (force || db.prepare('SELECT COUNT(*) c FROM gallery').get().c === 0) {
    if (force) db.exec('DELETE FROM gallery');
    const ins = db.prepare('INSERT INTO gallery (type, title, src, poster, caption, sort_order) VALUES (?,?,?,?,?,?)');
    [
      ['image', 'Study No.1', '/assets/placeholders/g1.svg', '', 'Editorial art direction', 1],
      ['image', 'Study No.2', '/assets/placeholders/g2.svg', '', 'Brand identity exploration', 2],
      ['image', 'Study No.3', '/assets/placeholders/g3.svg', '', 'Motion frame', 3],
      ['image', 'Study No.4', '/assets/placeholders/g4.svg', '', '3D render study', 4],
      ['video', 'Showreel', '', '/assets/placeholders/v1.svg', 'Studio showreel 2026 — replace with your MP4', 5],
      ['image', 'Study No.5', '/assets/placeholders/g5.svg', '', 'Poster series', 6]
    ].forEach(r => ins.run(...r));
  }

  if (force || db.prepare('SELECT COUNT(*) c FROM posts').get().c === 0) {
    if (force) db.exec('DELETE FROM posts');
    const ins = db.prepare('INSERT INTO posts (title, slug, excerpt, content, cover_image, status, author, tags) VALUES (?,?,?,?,?,?,?,?)');
    [
      ['How we build brand systems that scale', 'brand-systems-that-scale',
        'A look inside our process for designing identities that hold up across every touchpoint.',
        '<p>Great brands are not logos — they are systems. In this piece we break down the way we approach identity design, from the first moodboard to a living design language your whole team can use.</p><h2>Start with the story</h2><p>Before a single shape is drawn, we map the narrative. What does the brand believe? Who is it for? The answers become the constraints that make design decisions easy.</p><h2>Design the components</h2><p>Type, color, grid, motion, and imagery are designed as a kit of parts. Each element is documented so it can be reused with confidence.</p><blockquote>Consistency is not repetition. It is a shared point of view expressed a thousand different ways.</blockquote><p>The result is a system that feels unmistakably one thing, no matter where it shows up.</p>',
        '/assets/placeholders/b1.svg', 'published', 'Studio', 'branding, process'],
      ['The craft of motion: 12 principles we live by', 'craft-of-motion',
        'Motion is emotion. Here are the principles that guide every frame we animate.',
        '<p>Motion design is where craft meets feeling. Over the years we distilled our approach into a handful of principles that keep our work expressive and intentional.</p><h2>Ease is everything</h2><p>Nothing in nature moves linearly. The right easing curve is the difference between mechanical and alive.</p><h2>Motion with meaning</h2><p>Every movement should carry information or emotion. If it does neither, cut it.</p><p>These ideas shape our showreel, our title sequences, and the micro-interactions that make a product feel premium.</p>',
        '/assets/placeholders/b2.svg', 'published', 'Studio', 'motion, craft'],
      ['Designing for fintech: trust is the aesthetic', 'designing-for-fintech',
        'Why dark themes, restraint, and precise typography build credibility with finance customers.',
        '<p>In finance, design is not decoration — it is a signal of trust. This post explores how we use tone, contrast, and typography to make products feel secure and serious.</p><h2>Dark, but not cold</h2><p>A dark canvas with a single confident accent reads as focused and premium. The trick is warmth: one coral highlight can carry an entire interface.</p><h2>Precision typography</h2><p>Tight, considered type communicates competence before a user reads a word.</p><p>Draft posts like this one let your team plan content in advance — flip the status to Published when ready.</p>',
        '/assets/placeholders/b3.svg', 'draft', 'Studio', 'fintech, ux']
    ].forEach(r => ins.run(...r));
  }

  console.log('✓ Database ready at', DB_PATH);
}

module.exports = { db, connect, seed, init, DEFAULT_SETTINGS };

// CLI: `node db.js --seed` (force reseed) or `node db.js` (ensure only).
if (require.main === module) {
  (async () => {
    await connect();
    const force = process.argv.includes('--seed') || process.argv.includes('--force');
    seed({ force });
    // give the debounced save a moment, then flush explicitly.
    setTimeout(() => { console.log(force ? '✓ Reseeded demo content.' : '✓ Initialized database.'); process.exit(0); }, 120);
  })();
}
