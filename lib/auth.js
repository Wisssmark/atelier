/** Authentication helpers — JWT stored in an httpOnly cookie. */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const WEAK_SECRETS = new Set(['', 'dev-only-secret-change-me', 'please-change-this-to-a-long-random-string']);

let SECRET = process.env.JWT_SECRET || '';
if (WEAK_SECRETS.has(SECRET) || SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    // Refuse to boot with a guessable signing key in production.
    throw new Error(
      'JWT_SECRET must be set to a random string of at least 32 characters in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  // Development: use a random per-boot secret instead of a hardcoded one.
  // (Sessions reset on restart, which is fine for local dev.)
  SECRET = crypto.randomBytes(48).toString('hex');
}

const COOKIE = 'atelier_token';

function sign(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = req.cookies?.[COOKIE] || header.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

module.exports = { sign, setAuthCookie, clearAuthCookie, requireAuth, COOKIE, SECRET };
