/** Protected admin API: login, media upload, and CRUD for all content. */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const { db } = require('../db');
const { sign, setAuthCookie, clearAuthCookie, requireAuth } = require('../lib/auth');
const { rateLimit } = require('../lib/rate-limit');

const router = express.Router();

/* ---------------------------------- Auth --------------------------------- */
// Max 10 login attempts per IP per 15 minutes — blocks password brute-forcing.
const loginLimiter = rateLimit({ windowMs: 15 * 60000, max: 10, message: 'Too many login attempts. Try again in 15 minutes.' });

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  const token = sign(user);
  setAuthCookie(res, token);
  res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role }, token });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post('/change-password', requireAuth, (req, res) => {
  const { current, next: nextPass } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(String(current || ''), user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  if (!nextPass || String(nextPass).length < 10) {
    return res.status(400).json({ error: 'New password must be at least 10 characters.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(nextPass), 12), user.id);
  res.json({ ok: true });
});

/* --------------------------------- Uploads -------------------------------- */
const UPLOAD_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Strict allowlist: permitted extension + the MIME types it may claim +
 * a magic-byte check run against the actual file contents after saving.
 * Never trust the client-supplied filename or Content-Type.
 */
const ALLOWED_TYPES = {
  '.jpg':  { mimes: ['image/jpeg'], magic: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  '.jpeg': { mimes: ['image/jpeg'], magic: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  '.png':  { mimes: ['image/png'],  magic: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  '.gif':  { mimes: ['image/gif'],  magic: b => b.slice(0, 4).toString('ascii') === 'GIF8' },
  '.webp': { mimes: ['image/webp'], magic: b => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  '.avif': { mimes: ['image/avif'], magic: b => b.slice(4, 8).toString('ascii') === 'ftyp' },
  '.svg':  { mimes: ['image/svg+xml'], magic: b => /^\s*(<\?xml|<svg)/i.test(b.toString('utf8', 0, 256)) },
  '.mp4':  { mimes: ['video/mp4'],  magic: b => b.slice(4, 8).toString('ascii') === 'ftyp' },
  '.m4v':  { mimes: ['video/mp4', 'video/x-m4v'], magic: b => b.slice(4, 8).toString('ascii') === 'ftyp' },
  '.mov':  { mimes: ['video/quicktime'], magic: b => b.slice(4, 8).toString('ascii') === 'ftyp' },
  '.webm': { mimes: ['video/webm'], magic: b => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3 }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Server-generated name; only the validated extension survives.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }, // 50MB, single file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const rule = ALLOWED_TYPES[ext];
    if (!rule) return cb(new Error('File type not allowed. Permitted: ' + Object.keys(ALLOWED_TYPES).join(', ')));
    if (!rule.mimes.includes(file.mimetype)) return cb(new Error('File content type does not match its extension.'));
    cb(null, true);
  }
});

/** Verify the saved file's real contents match the claimed type; delete it if not. */
function verifyUpload(file) {
  const ext = path.extname(file.filename).toLowerCase();
  const rule = ALLOWED_TYPES[ext];
  if (!rule) return 'File type not allowed.';
  const fd = fs.openSync(file.path, 'r');
  const head = Buffer.alloc(512);
  try { fs.readSync(fd, head, 0, 512, 0); } finally { fs.closeSync(fd); }
  if (!rule.magic(head)) return 'File contents do not match the declared type.';
  // SVGs are XML and can embed scripts — reject any active content outright.
  if (ext === '.svg') {
    const text = fs.readFileSync(file.path, 'utf8');
    if (/<script|javascript:|on\w+\s*=|<foreignObject|href\s*=\s*["']?\s*data:/i.test(text)) {
      return 'SVG files with scripts or event handlers are not allowed.';
    }
  }
  return null;
}

router.post('/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const problem = verifyUpload(req.file);
    if (problem) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: problem });
    }
    res.json({ ok: true, url: `/uploads/${req.file.filename}`, type: req.file.mimetype });
  });
});

/* --------------------------------- Helpers -------------------------------- */
function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'post';
}
function uniqueSlug(base, ignoreId = 0) {
  let slug = slugify(base), n = 1;
  while (db.prepare('SELECT id FROM posts WHERE slug = ? AND id != ?').get(slug, ignoreId)) {
    slug = `${slugify(base)}-${++n}`;
  }
  return slug;
}

/* ---------------------------------- Posts --------------------------------- */
router.get('/posts', requireAuth, (req, res) =>
  res.json(db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all())
);
router.get('/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(post);
});
router.post('/posts', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Title is required.' });
  const slug = uniqueSlug(b.slug || b.title);
  const info = db.prepare(
    `INSERT INTO posts (title, slug, excerpt, content, cover_image, status, author, tags)
     VALUES (@title,@slug,@excerpt,@content,@cover_image,@status,@author,@tags)`
  ).run({
    title: b.title, slug,
    excerpt: b.excerpt || '', content: b.content || '',
    cover_image: b.cover_image || '', status: b.status === 'published' ? 'published' : 'draft',
    author: b.author || 'Studio', tags: b.tags || ''
  });
  res.json(db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid));
});
router.put('/posts/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const slug = b.slug ? uniqueSlug(b.slug, existing.id) : existing.slug;
  db.prepare(
    `UPDATE posts SET title=@title, slug=@slug, excerpt=@excerpt, content=@content,
     cover_image=@cover_image, status=@status, author=@author, tags=@tags,
     updated_at=datetime('now') WHERE id=@id`
  ).run({
    id: existing.id,
    title: b.title ?? existing.title, slug,
    excerpt: b.excerpt ?? existing.excerpt, content: b.content ?? existing.content,
    cover_image: b.cover_image ?? existing.cover_image,
    status: b.status === 'published' ? 'published' : 'draft',
    author: b.author ?? existing.author, tags: b.tags ?? existing.tags
  });
  res.json(db.prepare('SELECT * FROM posts WHERE id = ?').get(existing.id));
});
router.delete('/posts/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* -------------------------------- Projects -------------------------------- */
router.get('/projects', requireAuth, (req, res) =>
  res.json(db.prepare('SELECT * FROM projects ORDER BY sort_order, id').all())
);
router.post('/projects', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Title is required.' });
  const info = db.prepare(
    `INSERT INTO projects (title, category, description, cover_image, url, featured, sort_order)
     VALUES (@title,@category,@description,@cover_image,@url,@featured,@sort_order)`
  ).run({
    title: b.title, category: b.category || 'Work', description: b.description || '',
    cover_image: b.cover_image || '', url: b.url || '',
    featured: b.featured ? 1 : 0, sort_order: Number(b.sort_order) || 0
  });
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid));
});
router.put('/projects/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const e = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    `UPDATE projects SET title=@title, category=@category, description=@description,
     cover_image=@cover_image, url=@url, featured=@featured, sort_order=@sort_order WHERE id=@id`
  ).run({
    id: e.id,
    title: b.title ?? e.title, category: b.category ?? e.category,
    description: b.description ?? e.description, cover_image: b.cover_image ?? e.cover_image,
    url: b.url ?? e.url, featured: (b.featured ?? e.featured) ? 1 : 0,
    sort_order: b.sort_order != null ? Number(b.sort_order) : e.sort_order
  });
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(e.id));
});
router.delete('/projects/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* --------------------------------- Gallery -------------------------------- */
router.get('/gallery', requireAuth, (req, res) =>
  res.json(db.prepare('SELECT * FROM gallery ORDER BY sort_order, id').all())
);
router.post('/gallery', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.src && !b.poster) return res.status(400).json({ error: 'A media source is required.' });
  const info = db.prepare(
    `INSERT INTO gallery (type, title, src, poster, caption, sort_order)
     VALUES (@type,@title,@src,@poster,@caption,@sort_order)`
  ).run({
    type: b.type === 'video' ? 'video' : 'image', title: b.title || '',
    src: b.src || '', poster: b.poster || '', caption: b.caption || '',
    sort_order: Number(b.sort_order) || 0
  });
  res.json(db.prepare('SELECT * FROM gallery WHERE id = ?').get(info.lastInsertRowid));
});
router.put('/gallery/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const e = db.prepare('SELECT * FROM gallery WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    `UPDATE gallery SET type=@type, title=@title, src=@src, poster=@poster,
     caption=@caption, sort_order=@sort_order WHERE id=@id`
  ).run({
    id: e.id, type: (b.type ?? e.type) === 'video' ? 'video' : 'image',
    title: b.title ?? e.title, src: b.src ?? e.src, poster: b.poster ?? e.poster,
    caption: b.caption ?? e.caption,
    sort_order: b.sort_order != null ? Number(b.sort_order) : e.sort_order
  });
  res.json(db.prepare('SELECT * FROM gallery WHERE id = ?').get(e.id));
});
router.delete('/gallery/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------------------------- Stats --------------------------------- */
router.get('/stats', requireAuth, (req, res) =>
  res.json(db.prepare('SELECT * FROM stats ORDER BY sort_order, id').all())
);
router.post('/stats', requireAuth, (req, res) => {
  const b = req.body || {};
  const info = db.prepare('INSERT INTO stats (label, value, suffix, sort_order) VALUES (?,?,?,?)')
    .run(b.label || 'Stat', Number(b.value) || 0, b.suffix || '', Number(b.sort_order) || 0);
  res.json(db.prepare('SELECT * FROM stats WHERE id = ?').get(info.lastInsertRowid));
});
router.put('/stats/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const e = db.prepare('SELECT * FROM stats WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE stats SET label=?, value=?, suffix=?, sort_order=? WHERE id=?')
    .run(b.label ?? e.label, b.value != null ? Number(b.value) : e.value,
         b.suffix ?? e.suffix, b.sort_order != null ? Number(b.sort_order) : e.sort_order, e.id);
  res.json(db.prepare('SELECT * FROM stats WHERE id = ?').get(e.id));
});
router.delete('/stats/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM stats WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* -------------------------------- Settings -------------------------------- */
router.get('/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});
router.put('/settings', requireAuth, (req, res) => {
  const b = req.body || {};
  const stmt = db.prepare(
    'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  );
  const tx = db.transaction(obj => {
    for (const [k, v] of Object.entries(obj)) stmt.run(k, String(v ?? ''));
  });
  tx(b);
  res.json({ ok: true });
});

/* -------------------------------- Messages -------------------------------- */
router.get('/messages', requireAuth, (req, res) =>
  res.json(db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all())
);
router.delete('/messages/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
