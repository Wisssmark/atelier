/** Public (read-only) API + contact form. */
const express = require('express');
const { db } = require('../db');
const { rateLimit } = require('../lib/rate-limit');

const router = express.Router();

// All public settings as a { key: value } object
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

router.get('/stats', (req, res) => {
  res.json(db.prepare('SELECT * FROM stats ORDER BY sort_order, id').all());
});

router.get('/projects', (req, res) => {
  res.json(db.prepare('SELECT * FROM projects ORDER BY sort_order, id').all());
});

router.get('/gallery', (req, res) => {
  res.json(db.prepare('SELECT * FROM gallery ORDER BY sort_order, id').all());
});

// Published posts only, newest first
router.get('/posts', (req, res) => {
  res.json(
    db.prepare("SELECT id,title,slug,excerpt,cover_image,author,tags,created_at FROM posts WHERE status='published' ORDER BY created_at DESC").all()
  );
});

router.get('/posts/:slug', (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE slug = ? AND status='published'").get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
});

// Contact form submissions (rate-limited: 5 per 10 minutes per IP)
const contactLimiter = rateLimit({ windowMs: 10 * 60000, max: 5, message: 'Too many messages sent. Please try again later.' });
router.post('/contact', contactLimiter, (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email)) || String(email).length > 200) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  db.prepare('INSERT INTO messages (name, email, subject, message) VALUES (?,?,?,?)')
    .run(String(name).slice(0, 200), String(email).slice(0, 200), String(subject || '').slice(0, 200), String(message).slice(0, 5000));
  res.json({ ok: true });
});

module.exports = router;
