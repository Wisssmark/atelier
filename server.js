/**
 * Atelier — full-stack creative portfolio + blog CMS.
 * Express server: serves the static front-end and the JSON API.
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { connect, seed } = require('./db');
const publicApi = require('./routes/api');
const adminApi = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Don't advertise the framework, and trust the reverse proxy (needed for
// correct client IPs in rate limiting and secure cookies behind HTTPS).
app.disable('x-powered-by');
if (IS_PROD) app.set('trust proxy', 1);

/* --------------------------- Security headers ---------------------------- */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (IS_PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// User-uploaded files: never allow them to run scripts or be framed, even if
// something unexpected slips through upload validation (defense in depth).
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'public', 'uploads');
app.use('/uploads', (req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}, express.static(UPLOADS_DIR, { dotfiles: 'ignore' }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API routes
app.use('/api', publicApi);
app.use('/api/admin', adminApi);

// Static front-end (public site + admin dashboard + uploads)
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore' }));

// Pretty routes
app.get('/blog/:slug', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'post.html'))
);
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'))
);

// 404 fallback for unknown API calls
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Connect to the database (async — sql.js loads a WASM module), seed, then listen.
connect()
  .then(() => {
    seed({ force: false });
    if (IS_PROD && (process.env.ADMIN_PASSWORD || 'admin123') === 'admin123') {
      console.warn('  ⚠ ADMIN_PASSWORD is not set — if this is a fresh database the admin account uses the default password. Change it immediately in the dashboard.');
    }
    app.listen(PORT, () => {
      console.log(`\n  ▲ Atelier running`);
      console.log(`  → Site:      http://localhost:${PORT}`);
      console.log(`  → Admin:     http://localhost:${PORT}/admin`);
    });
  })
  .catch((err) => {
    console.error('Failed to start Atelier:', err);
    process.exit(1);
  });
